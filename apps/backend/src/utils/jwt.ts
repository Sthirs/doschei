import jwt from 'jsonwebtoken';

import { env } from '../config/env';

type AuthTokenPayload = {
  userId: string;
  email: string;
};

export const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

export const verifyAuthToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
