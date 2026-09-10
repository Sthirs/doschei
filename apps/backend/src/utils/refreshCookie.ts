import type { Request, Response } from 'express';

import { env } from '../config/env';

/**
 * The refresh-token cookie (ADR-0023).
 *
 * Scoped to the `/api/auth/session` router mount so the secret reaches
 * exactly the two endpoints that need it — refresh and logout — and nothing
 * else. A broader `/api/auth` path would also attach it to `GET /api/auth/me`,
 * which the router guard calls on every navigation, and `/` would attach it to
 * every asset request.
 *
 * `sameSite: 'strict'` (unlike the `doschei.oauth.state` cookie's `'lax'`,
 * which must survive the IdP's cross-site redirect back to the callback):
 * this cookie is only ever sent by same-origin XHR, so Strict costs nothing
 * and removes CSRF outright. Note that `Set-Cookie` itself is not filtered by
 * SameSite, so the OAuth callback redirect can still issue it.
 */
export const REFRESH_COOKIE_NAME = 'doschei.auth.refresh';
export const REFRESH_COOKIE_PATH = '/api/auth/session';

type CookiesBag = Record<string, string | undefined>;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  // Mirrors the doschei.oauth.state precedent: dev, CI, and Minikube run
  // devMode (NODE_ENV=development) over plain HTTP, where a `secure` cookie
  // would be silently discarded by the browser.
  secure: env.NODE_ENV === 'production',
  path: REFRESH_COOKIE_PATH,
});

/**
 * Issue (or re-issue, after a rotation) the refresh cookie. `maxAge` is
 * re-sent on every rotation so the browser-side expiry slides forward in step
 * with the database row.
 */
export const setRefreshCookie = (response: Response, raw: string): void => {
  response.cookie(REFRESH_COOKIE_NAME, raw, {
    ...cookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
};

/**
 * Clear the cookie. The `path` must match the one it was set with, or the
 * browser keeps the original cookie.
 */
export const clearRefreshCookie = (response: Response): void => {
  response.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
};

export const readRefreshCookie = (request: Request): string | undefined => {
  const cookies = (request as Request & { cookies?: CookiesBag }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME];
};
