/**
 * The `/api/auth/session` endpoints (ADR-0023), driven through the real Express
 * app via supertest with the rotation service stubbed — so this file pins the
 * HTTP contract (status, body, Set-Cookie) while
 * tests/auth/refreshTokenRotation.test.ts pins the state machine behind it.
 *
 * Two contracts here matter beyond the obvious:
 *
 *  1. Both endpoints work with NO Authorization header. Refresh is reached
 *     precisely because the access token expired, so requiring a valid bearer
 *     token would make the endpoint useless.
 *  2. The `refresh_race` outcome must NOT clear the cookie. A sibling tab won
 *     the rotation and holds the live successor; clearing here would turn a
 *     benign multi-tab race into a sign-out.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rotateRefreshToken, revokeFamilyByRawToken, issueRefreshToken } =
  vi.hoisted(() => ({
    rotateRefreshToken: vi.fn(),
    revokeFamilyByRawToken: vi.fn(async () => undefined),
    issueRefreshToken: vi.fn(async () => ({
      raw: 'issued-raw',
      expiresAt: new Date(Date.now() + 1000),
    })),
  }));

vi.mock('../../src/services/refreshTokenService', () => ({
  rotateRefreshToken,
  revokeFamilyByRawToken,
  issueRefreshToken,
  pruneExpiredRefreshTokens: vi.fn(async () => 0),
}));

const STORED_USER = {
  id: 'u1',
  email: 'u@doschei.local',
  displayName: 'Demo',
  language: 'en',
  imageUrl: null,
  passwordHash: 'hashed',
};

const { userRows } = vi.hoisted(() => ({ userRows: { current: [] as unknown[] } }));

vi.mock('../../src/db/data-source', () => ({
  AppDataSource: {
    getRepository: () => ({
      async findOne({ where }: { where: Record<string, unknown> }) {
        return (
          (userRows.current as Array<Record<string, unknown>>).find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null
        );
      },
    }),
    transaction: vi.fn(),
    manager: { getRepository: () => ({}) },
  },
  initializeDatabase: vi.fn(async () => undefined),
}));

import { createApp } from '../../src/app';

const app = createApp();
const COOKIE = 'doschei.auth.refresh=raw-secret';

/** All Set-Cookie lines for our cookie, as raw strings. */
const refreshCookies = (headers: Record<string, unknown>): string[] =>
  ((headers['set-cookie'] as string[] | undefined) ?? []).filter((line) =>
    line.startsWith('doschei.auth.refresh='),
  );

const isClearing = (line: string): boolean =>
  /doschei\.auth\.refresh=;/.test(line) || /Expires=Thu, 01 Jan 1970/.test(line);

beforeEach(() => {
  vi.clearAllMocks();
  userRows.current = [STORED_USER];
});

describe('POST /api/auth/session/refresh', () => {
  it('rotates and returns the same { token, user } shape as login', async () => {
    rotateRefreshToken.mockResolvedValue({
      kind: 'rotated',
      userId: 'u1',
      raw: 'successor-secret',
      expiresAt: new Date(Date.now() + 1000),
    });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toEqual({
      id: 'u1',
      email: 'u@doschei.local',
      displayName: 'Demo',
      language: 'en',
      imageUrl: null,
    });
  });

  it('never puts the refresh secret in the body — only in the cookie', async () => {
    rotateRefreshToken.mockResolvedValue({
      kind: 'rotated',
      userId: 'u1',
      raw: 'successor-secret',
      expiresAt: new Date(Date.now() + 1000),
    });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);

    expect(JSON.stringify(response.body)).not.toContain('successor-secret');
    expect(refreshCookies(response.headers)[0]).toContain('successor-secret');
  });

  it('sets the rotated cookie httpOnly, strict, and scoped to the session path', async () => {
    rotateRefreshToken.mockResolvedValue({
      kind: 'rotated',
      userId: 'u1',
      raw: 'successor-secret',
      expiresAt: new Date(Date.now() + 1000),
    });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);
    const cookie = refreshCookies(response.headers)[0] ?? '';

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth/session');
  });

  it('succeeds with no Authorization header at all', async () => {
    rotateRefreshToken.mockResolvedValue({
      kind: 'rotated',
      userId: 'u1',
      raw: 'successor-secret',
      expiresAt: new Date(Date.now() + 1000),
    });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(200);
  });

  it('401s with missing_refresh_token when no cookie is sent, without rotating', async () => {
    const response = await request(app).post('/api/auth/session/refresh');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('missing_refresh_token');
    expect(rotateRefreshToken).not.toHaveBeenCalled();
  });

  it.each([
    ['not-found', 'invalid_refresh_token'],
    ['expired', 'expired_refresh_token'],
    ['revoked', 'revoked_refresh_token'],
    ['reuse', 'refresh_reuse'],
  ])('maps outcome %s to 401 %s and clears the cookie', async (kind, code) => {
    rotateRefreshToken.mockResolvedValue({ kind });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe(code);
    expect(refreshCookies(response.headers).some(isClearing)).toBe(true);
  });

  it('maps a race to 401 refresh_race and LEAVES the cookie alone', async () => {
    rotateRefreshToken.mockResolvedValue({ kind: 'race' });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('refresh_race');
    expect(refreshCookies(response.headers)).toHaveLength(0);
  });

  it('401s when the rotation succeeded but the user row is gone', async () => {
    userRows.current = [];
    rotateRefreshToken.mockResolvedValue({
      kind: 'rotated',
      userId: 'deleted-user',
      raw: 'successor-secret',
      expiresAt: new Date(Date.now() + 1000),
    });

    const response = await request(app)
      .post('/api/auth/session/refresh')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('invalid_refresh_token');
    expect(refreshCookies(response.headers).some(isClearing)).toBe(true);
  });
});

describe('POST /api/auth/session/logout', () => {
  it('revokes the family and returns 204 with a clearing cookie', async () => {
    const response = await request(app)
      .post('/api/auth/session/logout')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(revokeFamilyByRawToken).toHaveBeenCalledWith('raw-secret');
    expect(refreshCookies(response.headers).some(isClearing)).toBe(true);
  });

  it('is idempotent: 204 with no cookie, and no revocation attempted', async () => {
    const response = await request(app).post('/api/auth/session/logout');

    expect(response.status).toBe(204);
    expect(revokeFamilyByRawToken).not.toHaveBeenCalled();
  });

  it('does not require a bearer token', async () => {
    const response = await request(app)
      .post('/api/auth/session/logout')
      .set('Cookie', COOKIE);

    expect(response.status).toBe(204);
  });

  it('clears with the same Path it was set with', async () => {
    const response = await request(app)
      .post('/api/auth/session/logout')
      .set('Cookie', COOKIE);

    expect(refreshCookies(response.headers)[0]).toContain(
      'Path=/api/auth/session',
    );
  });
});
