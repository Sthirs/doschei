import { NextFunction, Request, RequestHandler, Response } from 'express';

import { AuthService, sanitizeUser } from '../services/authService';
import { verifyAuthToken } from '../utils/jwt';

const authService = new AuthService();

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: string;
  };
};

export const requireAuth = async (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  const authorizationHeader = request.header('authorization');

  if (!authorizationHeader?.startsWith('Bearer ')) {
    response.status(401).json({ message: 'Missing bearer token.' });
    return;
  }

  try {
    const token = authorizationHeader.replace('Bearer ', '');
    const payload = verifyAuthToken(token);
    const user = await authService.findById(payload.userId);

    if (!user) {
      response.status(401).json({ message: 'Invalid authentication token.' });
      return;
    }

    request.auth = { userId: user.id };
    response.locals.user = sanitizeUser(user);
    next();
  } catch {
    response.status(401).json({ message: 'Invalid authentication token.' });
  }
};

export const requireLocalAuthEnabled = (
  enabled: boolean,
  message: string,
  code: string,
): RequestHandler =>
  (_request, response, next): void => {
    if (!enabled) {
      response.status(403).json({ message, code });
      return;
    }
    next();
  };
