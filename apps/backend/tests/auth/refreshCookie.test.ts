/**
 * Pins the refresh cookie's flags (ADR-0023). Each one is load-bearing:
 *
 *  - `httpOnly` is the whole point of moving the long-lived credential out of
 *    localStorage; without it the ADR buys nothing.
 *  - `path` must equal the router mount, or the cookie either leaks to every
 *    request (`/`) or never reaches logout (`/api/auth/session/refresh`).
 *  - `sameSite: 'strict'` is what removes CSRF without a token.
 *  - `secure` must follow NODE_ENV: hardcoding `true` would make the browser
 *    silently drop the cookie in dev, CI, and Minikube, all of which are
 *    plain HTTP.
 *
 * The flags are computed per call rather than at module load, so flipping
 * `envMock.NODE_ENV` between tests is enough — no module re-import needed.
 */
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: 'development' as string,
    REFRESH_TOKEN_TTL_SECONDS: 7776000,
  },
}));

vi.mock('../../src/config/env', () => ({ env: envMock }));

import {
  clearRefreshCookie,
  readRefreshCookie,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  setRefreshCookie,
} from '../../src/utils/refreshCookie';

type ResponseStub = Response & {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
};

const makeResponse = (): ResponseStub =>
  ({ cookie: vi.fn(), clearCookie: vi.fn() }) as unknown as ResponseStub;

beforeEach(() => {
  envMock.NODE_ENV = 'development';
});

describe('setRefreshCookie', () => {
  it('sets httpOnly, strict, the session path, and the refresh max-age', () => {
    const response = makeResponse();

    setRefreshCookie(response, 'raw-secret');

    expect(REFRESH_COOKIE_NAME).toBe('doschei.auth.refresh');
    expect(REFRESH_COOKIE_PATH).toBe('/api/auth/session');
    expect(response.cookie).toHaveBeenCalledWith(
      'doschei.auth.refresh',
      'raw-secret',
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/api/auth/session',
        maxAge: 7776000 * 1000,
      },
    );
  });

  it('is NOT secure under NODE_ENV=development (dev and CI run plain HTTP)', () => {
    const response = makeResponse();

    setRefreshCookie(response, 'raw-secret');

    expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({ secure: false });
  });

  it('IS secure under NODE_ENV=production', () => {
    envMock.NODE_ENV = 'production';
    const response = makeResponse();

    setRefreshCookie(response, 'raw-secret');

    expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({ secure: true });
  });

  it('slides the browser-side expiry with the max-age on every rotation', () => {
    envMock.REFRESH_TOKEN_TTL_SECONDS = 60;
    const response = makeResponse();

    setRefreshCookie(response, 'raw-secret');

    expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({ maxAge: 60000 });
    envMock.REFRESH_TOKEN_TTL_SECONDS = 7776000;
  });
});

describe('clearRefreshCookie', () => {
  it('clears with the same path and flags, or the browser keeps the cookie', () => {
    const response = makeResponse();

    clearRefreshCookie(response);

    expect(response.clearCookie).toHaveBeenCalledWith('doschei.auth.refresh', {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      path: '/api/auth/session',
    });
  });
});

describe('readRefreshCookie', () => {
  it('reads what cookie-parser put on the request', () => {
    expect(
      readRefreshCookie({
        cookies: { 'doschei.auth.refresh': 'raw' },
      } as never),
    ).toBe('raw');
  });

  it('returns undefined when the cookie is absent', () => {
    expect(readRefreshCookie({ cookies: {} } as never)).toBeUndefined();
  });

  it('does not throw when cookie-parser has not run', () => {
    expect(readRefreshCookie({} as never)).toBeUndefined();
  });
});
