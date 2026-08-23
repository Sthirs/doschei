import { Request, Response } from 'express';

import { env } from '../config/env';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  AuthService,
  normalizeRequestedLanguage,
  parseLanguage,
  sanitizeUser,
  type SupportedLanguage,
} from '../services/authService';
import { signAuthToken } from '../utils/jwt';

const authService = new AuthService();

export const register = async (request: Request, response: Response): Promise<void> => {
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

  if (typeof body.email !== 'string' || typeof body.password !== 'string' || typeof body.displayName !== 'string') {
    response.status(400).json({ message: 'Email, password, and display name are required.' });
    return;
  }

  // Device-language capture: body.language wins (lets the frontend send
  // navigator.language when a registration form ships); otherwise we
  // fall back to the browser's Accept-Language header (mirrors the
  // OAuth callback path).
  const headerAcceptLanguage = request.headers['accept-language'];
  const language = normalizeRequestedLanguage(body.language ?? headerAcceptLanguage);

  try {
    const user = await authService.register({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      language,
    });
    const token = signAuthToken({ userId: user.id, email: user.email });

    response.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to register.' });
  }
};

export const login = async (request: Request, response: Response): Promise<void> => {
  try {
    const user = await authService.login(request.body);
    const token = signAuthToken({ userId: user.id, email: user.email });

    response.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    response.status(401).json({ message: error instanceof Error ? error.message : 'Unable to login.' });
  }
};

export const me = async (_request: Request, response: Response): Promise<void> => {
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
export const updateName = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const body = (request.body ?? {}) as {
    displayName?: unknown;
    language?: unknown;
  };
  const { displayName, language } = body;

  const hasDisplayName = displayName !== undefined;
  const hasLanguage = language !== undefined;

  if (!hasDisplayName && !hasLanguage) {
    response.status(400).json({ message: 'At least one of displayName or language must be provided.' });
    return;
  }

  let validatedDisplayName: string | undefined;
  if (hasDisplayName) {
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      response.status(400).json({ message: 'Display name is required.' });
      return;
    }
    if (displayName.trim().length > 100) {
      response.status(400).json({ message: 'Display name must be 100 characters or fewer.' });
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
      request.auth!.userId,
      validatedDisplayName,
      validatedLanguage,
    );
    response.json({ user: sanitizeUser(user) });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update profile.' });
  }
};

export const authConfig = (_request: Request, response: Response): void => {
  response.json({
    localLoginEnabled: env.localLoginEnabled,
    localRegistrationEnabled: env.localRegistrationEnabled,
  });
};
