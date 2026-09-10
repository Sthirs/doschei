/**
 * Pins the access-token lifetime to `env.ACCESS_TOKEN_TTL_SECONDS`
 * (ADR-0023). Before this ADR the TTL was the source literal `'7d'`, which is
 * exactly what forced a sign-in every seven days — so a regression back to a
 * hardcoded value must turn this file red.
 */
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '../../src/config/env';
import { signAuthToken } from '../../src/utils/jwt';

type DecodedClaims = { iat: number; exp: number; userId: string; email: string };

describe('signAuthToken', () => {
  it('sets exp - iat to ACCESS_TOKEN_TTL_SECONDS', () => {
    const token = signAuthToken({ userId: 'u1', email: 'u@doschei.local' });
    const claims = jwt.decode(token) as DecodedClaims;

    expect(claims.exp - claims.iat).toBe(env.ACCESS_TOKEN_TTL_SECONDS);
  });

  it('defaults to one hour, not the seven days it replaced', () => {
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(3600);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).not.toBe(7 * 24 * 60 * 60);
  });

  it('still carries only the { userId, email } claim contract', () => {
    const token = signAuthToken({ userId: 'u1', email: 'u@doschei.local' });
    const claims = jwt.decode(token) as DecodedClaims;

    expect(Object.keys(claims).sort()).toEqual(['email', 'exp', 'iat', 'userId']);
  });
});
