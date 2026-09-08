/**
 * POST /api/auth/session/logout against a running deployment (ADR-0023).
 *
 * The assertion that matters is the last one in the first test: after logout the
 * refresh cookie is not merely cleared in the browser, it no longer works. That
 * is the difference between the local-only sign-out this app had before and real
 * server-side revocation.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  cookieHeader,
  cookieValue,
  createJsonRequest,
  ensureBackendAvailable,
  isClearingCookie,
  readSetCookie,
  REFRESH_COOKIE_NAME,
  registerUser,
} from './helpers/api';

type SessionBody = { token?: string; code?: string; message?: string };

const logoutWith = (raw?: string) =>
  createJsonRequest<SessionBody>('/api/auth/session/logout', {
    method: 'POST',
    ...(raw ? { headers: cookieHeader(REFRESH_COOKIE_NAME, raw) } : {}),
  });

const freshRefreshCookie = async (prefix: string): Promise<string> => {
  const registered = await registerUser(prefix);
  expect(registered.status).toBe(201);
  return cookieValue(readSetCookie(registered.headers, REFRESH_COOKIE_NAME) as string);
};

beforeAll(async () => {
  await ensureBackendAvailable();
});

describe('POST /api/auth/session/logout', () => {
  it('returns 204, clears the cookie, and revokes it server-side', async () => {
    const raw = await freshRefreshCookie('logout-happy');

    const response = await logoutWith(raw);

    expect(response.status).toBe(204);
    const line = readSetCookie(response.headers, REFRESH_COOKIE_NAME);
    expect(line && isClearingCookie(line)).toBe(true);
    expect(line).toContain('Path=/api/auth/session');

    // The real proof: replaying the cookie a client might have kept gets
    // nothing.
    const afterLogout = await createJsonRequest<SessionBody>(
      '/api/auth/session/refresh',
      { method: 'POST', headers: cookieHeader(REFRESH_COOKIE_NAME, raw) },
    );
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.code).toBe('revoked_refresh_token');
  });

  it('revokes the whole family, not just the presented link', async () => {
    const raw = await freshRefreshCookie('logout-family');
    const refreshed = await createJsonRequest<SessionBody>(
      '/api/auth/session/refresh',
      { method: 'POST', headers: cookieHeader(REFRESH_COOKIE_NAME, raw) },
    );
    const successor = cookieValue(
      readSetCookie(refreshed.headers, REFRESH_COOKIE_NAME) as string,
    );

    expect((await logoutWith(successor)).status).toBe(204);

    const replay = await createJsonRequest<SessionBody>('/api/auth/session/refresh', {
      method: 'POST',
      headers: cookieHeader(REFRESH_COOKIE_NAME, successor),
    });
    expect(replay.status).toBe(401);
  });

  it('is idempotent with no cookie at all', async () => {
    expect((await logoutWith()).status).toBe(204);
  });

  it('is idempotent when called twice', async () => {
    const raw = await freshRefreshCookie('logout-twice');

    expect((await logoutWith(raw)).status).toBe(204);
    expect((await logoutWith(raw)).status).toBe(204);
  });

  it('tolerates an unknown cookie value', async () => {
    expect((await logoutWith('not-a-real-secret')).status).toBe(204);
  });

  it('does not require a bearer token', async () => {
    const raw = await freshRefreshCookie('logout-nobearer');

    // No Authorization header is ever sent by logoutWith.
    expect((await logoutWith(raw)).status).toBe(204);
  });
});
