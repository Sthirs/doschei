import { Request, Response } from 'express';

import { env } from '../config/env';
import { AuthenticatedRequest } from '../middleware/auth';
import { AuthService, sanitizeUser } from '../services/authService';
import { signAuthToken } from '../utils/jwt';

const authService = new AuthService();

export const register = async (request: Request, response: Response): Promise<void> => {
  try {
    const user = await authService.register(request.body);
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

export const updateName = async (request: AuthenticatedRequest, response: Response): Promise<void> => {
  const { displayName } = request.body as { displayName?: unknown };

  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    response.status(400).json({ message: 'Display name is required.' });
    return;
  }

  if (displayName.trim().length > 100) {
    response.status(400).json({ message: 'Display name must be 100 characters or fewer.' });
    return;
  }

  try {
    const user = await authService.updateName(request.auth!.userId, displayName.trim());
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
