import { Request, Response } from 'express';

import { sanitizeUser } from '../../services/authService';
import {
  revokeFamilyByRawToken,
  rotateRefreshToken,
  type RotationOutcome,
} from '../../services/refreshTokenService';
import { signAuthToken } from '../../utils/jwt';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../../utils/refreshCookie';
import { authService } from './authServiceInstance';

/**
 * Session endpoints (ADR-0023), mounted at `/api/auth/session` — the same path
 * the refresh cookie is scoped to.
 *
 * Both are UNAUTHENTICATED by design: `refresh` is reached precisely when the
 * access token has expired, so requiring a valid bearer token would defeat the
 * purpose. The cookie is the credential.
 */

/**
 * Map a non-rotated outcome to its wire error. `race` is the one case that must
 * NOT clear the cookie: a sibling tab won the rotation and holds the live
 * successor, so discarding the browser's cookie here would turn a benign race
 * into a sign-out.
 */
const REFRESH_FAILURES: Record<
  Exclude<RotationOutcome['kind'], 'rotated'>,
  { code: string; message: string; clearCookie: boolean }
> = {
  'not-found': {
    code: 'invalid_refresh_token',
    message: 'Invalid refresh token.',
    clearCookie: true,
  },
  expired: {
    code: 'expired_refresh_token',
    message: 'Refresh token expired.',
    clearCookie: true,
  },
  revoked: {
    code: 'revoked_refresh_token',
    message: 'Refresh token revoked.',
    clearCookie: true,
  },
  race: {
    code: 'refresh_race',
    message: 'Refresh token already rotated by a concurrent request.',
    clearCookie: false,
  },
  reuse: {
    code: 'refresh_reuse',
    message: 'Refresh token reuse detected; all sessions were revoked.',
    clearCookie: true,
  },
};

/**
 * POST /api/auth/session/refresh — exchange the refresh cookie for a new
 * access token and a rotated refresh cookie.
 *
 * Returns the same `{ token, user }` shape as `login`, so the frontend reuses
 * its existing handling and gets a free language resync (ADR-0018) on renewal.
 * Dead-cookie outcomes clear the cookie, otherwise every cold boot would retry
 * a refresh that can never succeed.
 */
export const refresh = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const raw = readRefreshCookie(request);

  if (!raw) {
    clearRefreshCookie(response);
    response.status(401).json({
      message: 'Missing refresh token.',
      code: 'missing_refresh_token',
    });
    return;
  }

  const outcome = await rotateRefreshToken(raw);

  if (outcome.kind !== 'rotated') {
    const failure = REFRESH_FAILURES[outcome.kind];
    if (failure.clearCookie) clearRefreshCookie(response);
    response.status(401).json({ message: failure.message, code: failure.code });
    return;
  }

  // The family survived the user row being deleted (nothing cascades a delete
  // into an in-flight rotation). Treat it as an invalid token rather than
  // minting a token for a user who no longer exists.
  const user = await authService.findById(outcome.userId);
  if (!user) {
    clearRefreshCookie(response);
    response.status(401).json({
      message: 'Invalid refresh token.',
      code: 'invalid_refresh_token',
    });
    return;
  }

  setRefreshCookie(response, outcome.raw);
  response.json({
    token: signAuthToken({ userId: user.id, email: user.email }),
    user: sanitizeUser(user),
  });
};

/**
 * POST /api/auth/session/logout — revoke the whole refresh family and clear
 * the cookie.
 *
 * Idempotent: a missing or unknown cookie is a 204, so a client can always
 * reach a signed-out state. This is the only server-side revocation path a
 * user can trigger themselves.
 */
export const logout = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const raw = readRefreshCookie(request);

  if (raw) {
    await revokeFamilyByRawToken(raw);
  }

  clearRefreshCookie(response);
  response.status(204).send();
};
