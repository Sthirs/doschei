/**
 * POST /api/auth/session/refresh against a running deployment (ADR-0023).
 *
 * This is where rotation is proven end to end over the wire, against real
 * Postgres: the cookie's flags, that the secret never appears in a response
 * body, that a consumed token stops working, and that replaying one revokes the
 * whole family.
 *
 * Timing: the deployment runs with `REFRESH_TOKEN_REUSE_GRACE_SECONDS=1`
 * (forced by the chart's devMode branch in `_helpers.tpl`), so a replay just
 * over a second old is theft while an immediate replay is the multi-tab race.
 * `vitest.integration.config.ts` sets `fileParallelism: false`, so these sleeps
 * do not interleave with other files.
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
  sleep,
} from './helpers/api';

const GRACE_MS = 1500;

type SessionBody = {
  token?: string;
  user?: { id: string; email: string };
  code?: string;
  message?: string;
};

const refreshWith = (raw: string) =>
  createJsonRequest<SessionBody>('/api/auth/session/refresh', {
    method: 'POST',
    headers: cookieHeader(REFRESH_COOKIE_NAME, raw),
  });

/** Register a fresh user and return its refresh cookie value. */
const freshSession = async (prefix: string) => {
  const registered = await registerUser(prefix);
  expect(registered.status).toBe(201);

  const line = readSetCookie(registered.headers, REFRESH_COOKIE_NAME);
  expect(line, 'register must set the refresh cookie').toBeDefined();

  return { raw: cookieValue(line as string), user: registered.body.user, line: line as string };
};

beforeAll(async () => {
  await ensureBackendAvailable();
});

describe('refresh cookie issuance', () => {
  it('register sets an httpOnly, strict, session-scoped cookie', async () => {
    const { line } = await freshSession('refresh-issue');

    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Strict');
    expect(line).toContain('Path=/api/auth/session');
    expect(line).toMatch(/Max-Age=\d+/);
  });

  it('never puts the refresh secret in the response body', async () => {
    const registered = await registerUser('refresh-body');
    const raw = cookieValue(readSetCookie(registered.headers, REFRESH_COOKIE_NAME) as string);

    expect(JSON.stringify(registered.body)).not.toContain(raw);
  });

  it('login sets the cookie too, and the access token lasts an hour', async () => {
    const payload = { email: 'demo@doschei.local', password: 'password123' };
    const response = await createJsonRequest<SessionBody>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(readSetCookie(response.headers, REFRESH_COOKIE_NAME)).toBeDefined();

    const claims = JSON.parse(
      Buffer.from((response.body.token as string).split('.')[1], 'base64url').toString('utf8'),
    ) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(3600);
  });
});

describe('rotation', () => {
  it('exchanges the cookie for a new access token and a NEW cookie', async () => {
    const { raw, user } = await freshSession('refresh-happy');

    const refreshed = await refreshWith(raw);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toEqual(expect.any(String));
    expect(refreshed.body.user?.id).toBe(user?.id);

    const rotated = cookieValue(
      readSetCookie(refreshed.headers, REFRESH_COOKIE_NAME) as string,
    );
    expect(rotated).not.toBe(raw);
    expect(rotated.length).toBeGreaterThan(20);
  });

  it('works with NO Authorization header — the cookie is the credential', async () => {
    const { raw } = await freshSession('refresh-nobearer');

    // refreshWith sends only the Cookie header.
    expect((await refreshWith(raw)).status).toBe(200);
  });

  it('chains: three consecutive refreshes all succeed (sliding window)', async () => {
    const { raw } = await freshSession('refresh-chain');
    let current = raw;

    for (let i = 0; i < 3; i += 1) {
      const response = await refreshWith(current);
      expect(response.status, `refresh #${i + 1}`).toBe(200);
      current = cookieValue(readSetCookie(response.headers, REFRESH_COOKIE_NAME) as string);
    }

    expect(current).not.toBe(raw);
  });
});

describe('denials', () => {
  it('no cookie → 401 missing_refresh_token', async () => {
    const response = await createJsonRequest<SessionBody>('/api/auth/session/refresh', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('missing_refresh_token');
  });

  it('an unknown cookie value → 401 invalid_refresh_token, and clears the cookie', async () => {
    const response = await refreshWith('definitely-not-a-real-secret');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('invalid_refresh_token');
    const line = readSetCookie(response.headers, REFRESH_COOKIE_NAME);
    expect(line && isClearingCookie(line)).toBe(true);
  });
});

describe('reuse detection', () => {
  it('an immediate replay is a race: 401 refresh_race, cookie left alone', async () => {
    const { raw } = await freshSession('refresh-race');
    const first = await refreshWith(raw);
    expect(first.status).toBe(200);

    const replay = await refreshWith(raw);

    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('refresh_race');
    // The sibling "tab" holds the live successor, so its cookie must survive.
    expect(readSetCookie(replay.headers, REFRESH_COOKIE_NAME)).toBeUndefined();
  });

  it('the successor still works after a race', async () => {
    const { raw } = await freshSession('refresh-race-survivor');
    const first = await refreshWith(raw);
    const successor = cookieValue(
      readSetCookie(first.headers, REFRESH_COOKIE_NAME) as string,
    );

    expect((await refreshWith(raw)).body.code).toBe('refresh_race');
    expect((await refreshWith(successor)).status).toBe(200);
  });

  it(
    'a replay past the grace window is theft: 401 refresh_reuse, and the whole family dies',
    { timeout: 20_000 },
    async () => {
      const { raw } = await freshSession('refresh-reuse');
      const first = await refreshWith(raw);
      const successor = cookieValue(
        readSetCookie(first.headers, REFRESH_COOKIE_NAME) as string,
      );

      await sleep(GRACE_MS);

      const replay = await refreshWith(raw);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('refresh_reuse');

      // The successor was still valid a moment ago; reuse detection must have
      // taken it down with the rest of the family.
      const afterRevocation = await refreshWith(successor);
      expect(afterRevocation.status).toBe(401);
      expect(afterRevocation.body.code).toBe('revoked_refresh_token');
    },
  );

  it(
    'revocation is scoped to the family, not the user',
    { timeout: 20_000 },
    async () => {
      // Two independent sign-ins for the same account: killing one family must
      // not sign the other device out.
      const payload = { email: 'demo@doschei.local', password: 'password123' };
      const loginOnce = async () => {
        const response = await createJsonRequest<SessionBody>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        return cookieValue(readSetCookie(response.headers, REFRESH_COOKIE_NAME) as string);
      };

      const deviceA = await loginOnce();
      const deviceB = await loginOnce();

      await refreshWith(deviceA);
      await sleep(GRACE_MS);
      expect((await refreshWith(deviceA)).body.code).toBe('refresh_reuse');

      expect((await refreshWith(deviceB)).status).toBe(200);
    },
  );
});
