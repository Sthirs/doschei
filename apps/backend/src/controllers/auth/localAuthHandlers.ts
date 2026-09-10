import { Request, Response } from 'express';

import { User } from '../../entities/User';
import {
  normalizeRequestedLanguage,
  sanitizeUser,
} from '../../services/authService';
import { issueRefreshToken } from '../../services/refreshTokenService';
import { signAuthToken } from '../../utils/jwt';
import { setRefreshCookie } from '../../utils/refreshCookie';
import { authService } from './authServiceInstance';

/**
 * Mint an access token and start a refresh-token family (ADR-0023), then send
 * the `{ token, user }` body that both register and login return.
 *
 * The raw refresh secret goes ONLY into the httpOnly cookie — never into the
 * response body, so a script that can read the page cannot read it.
 */
const issueSession = async (
  response: Response,
  user: User,
  status: number,
): Promise<void> => {
  const token = signAuthToken({ userId: user.id, email: user.email });
  const refresh = await issueRefreshToken(user.id);
  setRefreshCookie(response, refresh.raw);
  response.status(status).json({ token, user: sanitizeUser(user) });
};

export const register = async (
  request: Request,
  response: Response,
): Promise<void> => {
  // ADR-0013 whitelist pattern: destructure ONLY the expected fields
  // from the body. Anything else in the payload is ignored by
  // construction (no zod / express-validator for request bodies — the
  // repo convention is manual typeof checks).
  const body = (request.body ?? {}) as {
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
    language?: unknown;
  };

  if (
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    typeof body.displayName !== 'string'
  ) {
    response
      .status(400)
      .json({ message: 'Email, password, and display name are required.' });
    return;
  }

  // Device-language capture: body.language wins (lets the frontend send
  // navigator.language when a registration form ships); otherwise we
  // fall back to the browser's Accept-Language header (mirrors the
  // OAuth callback path).
  const headerAcceptLanguage = request.headers['accept-language'];
  const language = normalizeRequestedLanguage(
    body.language ?? headerAcceptLanguage,
  );

  let user;
  try {
    user = await authService.register({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      language,
    });
  } catch (error: unknown) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to register.',
    });
    return;
  }

  // Session issuance sits OUTSIDE the catch above on purpose: that catch means
  // "the request was rejected" (duplicate email, bad input), and reporting a
  // refresh-token write failure as a 400 would tell the user their details were
  // wrong. Letting it reach Express's error handler as a 500 is the honest
  // answer.
  await issueSession(response, user, 201);
};

export const login = async (
  request: Request,
  response: Response,
): Promise<void> => {
  let user;
  try {
    user = await authService.login(request.body);
  } catch (error: unknown) {
    response.status(401).json({
      message: error instanceof Error ? error.message : 'Unable to login.',
    });
    return;
  }

  // Outside the catch — see register. A 401 here must mean "wrong credentials",
  // never "the refresh-token insert failed".
  await issueSession(response, user, 200);
};
