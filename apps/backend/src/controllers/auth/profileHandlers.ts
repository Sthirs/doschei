import { Request, Response } from 'express';

import { AuthedRequest, AuthenticatedRequest } from '../../middleware/auth';
import {
  parseLanguage,
  sanitizeUser,
  type SupportedLanguage,
} from '../../services/authService';
import { authService } from './authServiceInstance';

export const me = async (
  _request: Request,
  response: Response,
): Promise<void> => {
  response.json({ user: response.locals.user });
};

/**
 * PATCH /api/auth/me — update the authenticated user's display name
 * and/or interface language.
 *
 * ADR-0013 whitelist: destructure ONLY `displayName` and `language`.
 * Any `email` or other field in the body is ignored.
 *
 * ADR-0018 D3 hardening: at least one of the two fields MUST be
 * present — a PATCH with neither is rejected with 400 (the alternative
 * would be a silent 200 no-op, which is the worst-of-both outcomes).
 */
export const updateName = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const body = (request.body ?? {}) as {
    displayName?: unknown;
    language?: unknown;
  };
  const { displayName, language } = body;

  const hasDisplayName = displayName !== undefined;
  const hasLanguage = language !== undefined;

  if (!hasDisplayName && !hasLanguage) {
    response.status(400).json({
      message: 'At least one of displayName or language must be provided.',
    });
    return;
  }

  let validatedDisplayName: string | undefined;
  if (hasDisplayName) {
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      response.status(400).json({ message: 'Display name is required.' });
      return;
    }
    if (displayName.trim().length > 100) {
      response
        .status(400)
        .json({ message: 'Display name must be 100 characters or fewer.' });
      return;
    }
    validatedDisplayName = displayName.trim();
  }

  // PATCH /me is an EXPLICIT user choice — unlike the device-derived
  // register / OAuth paths, unknown values are a real client error
  // (Task 7 integration assertion: "PATCH invalid language → 400").
  let validatedLanguage: SupportedLanguage | undefined;
  if (hasLanguage) {
    const parsed = parseLanguage(language);
    if (parsed === null) {
      response.status(400).json({ message: 'Language must be "en" or "it".' });
      return;
    }
    validatedLanguage = parsed;
  }

  try {
    const user = await authService.updateName(
      auth.userId,
      validatedDisplayName,
      validatedLanguage,
    );
    response.json({ user: sanitizeUser(user) });
  } catch (error: unknown) {
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to update profile.',
    });
  }
};
