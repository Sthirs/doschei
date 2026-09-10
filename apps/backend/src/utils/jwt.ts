import jwt from 'jsonwebtoken';

import { env } from '../config/env';

type AuthTokenPayload = {
  userId: string;
  email: string;
};

/**
 * Sign a short-lived access token (ADR-0023). `jsonwebtoken` reads a numeric
 * `expiresIn` as seconds, so the TTL is an operator knob
 * (`ACCESS_TOKEN_TTL_SECONDS`, default 3600) rather than the source literal
 * `'7d'` it replaced. Renewal is handled by the refresh-token rotation flow; an
 * expired access token surfaces as a 401 from `requireAuth`, which is the
 * trigger the frontend interceptor keys off.
 */
export const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS });

export const verifyAuthToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
