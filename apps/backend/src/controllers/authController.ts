import { Request, Response } from 'express';

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
