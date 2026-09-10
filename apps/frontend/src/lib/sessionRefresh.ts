import axios from 'axios';

import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '@/lib/authToken';
import type { AuthUser } from '@/types/auth';

/**
 * Silent access-token renewal against the ADR-0023 refresh cookie.
 *
 * This module deliberately imports NEITHER `lib/api` NOR `stores/auth`:
 * `stores/auth` already imports `lib/api`, so putting refresh logic in the
 * interceptor and reaching for the store from there would be a cycle. Instead
 * the store and router register callbacks at boot (see `main.ts`), which keeps
 * the graph acyclic:
 *
 *   lib/api ──► lib/sessionRefresh ──► lib/authToken
 *      │                 ▲
 *      ▼                 │ registered at boot, never imported
 *   stores/auth ─────────┘
 */

const REFRESH_URL = '/api/auth/session/refresh';
const REFRESH_LOCK = 'doschei.auth.refresh';

/**
 * `user` is `null` only on the cross-tab short-circuit below, where a sibling
 * tab already refreshed and there is no response body to read a user from. The
 * caller then fetches the user itself.
 */
export type RefreshedSession = { token: string; user: AuthUser | null };

type TokenListener = (token: string) => void;
type ExpiredListener = () => void;

let accessTokenListener: TokenListener | null = null;
let sessionExpiredListener: ExpiredListener | null = null;

/** Called with the new access token after every successful renewal. */
export const onAccessTokenChange = (listener: TokenListener): void => {
  accessTokenListener = listener;
};

/** Called when the session is genuinely dead and the user must sign in again. */
export const onSessionExpired = (listener: ExpiredListener): void => {
  sessionExpiredListener = listener;
};

/**
 * In-tab de-duplication: several requests failing with 401 at once must
 * produce exactly one refresh, not one each.
 */
let inFlight: Promise<RefreshedSession | null> | null = null;

/** Cold-boot restore runs at most once per page load. */
let bootRestoreAttempted = false;

/** Test seam — lets a spec re-exercise the once-per-load boot restore. */
export const resetSessionRefreshState = (): void => {
  inFlight = null;
  bootRestoreAttempted = false;
};

/**
 * Called by an explicit sign-out. Without this the router guard would fire a
 * speculative restore on the very next navigation — a pointless request against
 * a cookie the server just revoked, whose 401 then looked like an expiry and
 * redirected to `/login?error=expired` after a deliberate sign-out.
 */
export const suppressSessionRestore = (): void => {
  bootRestoreAttempted = true;
};

/**
 * Cross-tab de-duplication. Without this, two tabs whose access tokens expire
 * together both present the same cookie and one of them loses the rotation
 * race. The server's grace window is the correctness backstop; this just stops
 * the race arising in the first place.
 *
 * Web Locks is unavailable in some browsers and in the unit-test environment,
 * so a missing API degrades to in-tab-only serialization.
 */
const withRefreshLock = async <T>(run: () => Promise<T>): Promise<T> => {
  const locks = navigator.locks;
  if (!locks?.request) return run();
  return locks.request(REFRESH_LOCK, run) as Promise<T>;
};

const postRefresh = async (): Promise<RefreshedSession | null> => {
  // A bare axios call, NOT the shared `api` instance: `api`'s own response
  // interceptor reacts to 401 by refreshing, which would recurse.
  const { data } = await axios.post<{ token: string; user: AuthUser }>(
    REFRESH_URL,
    null,
    {
      withCredentials: true,
    },
  );
  return data;
};

/** The server's `code` for a denial, when there is one. */
const failureCode = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const data = error.response?.data as { code?: unknown } | undefined;
  return typeof data?.code === 'string' ? data.code : undefined;
};

/**
 * @param notifyOnExpiry whether a dead session should be reported to
 * `onSessionExpired`. False for the speculative cold-boot restore: a visitor who
 * was never signed in has nothing to expire, and reporting it would redirect
 * them with a misleading "your session expired".
 */
const attemptRefresh = async (
  notifyOnExpiry: boolean,
): Promise<RefreshedSession | null> => {
  const tokenBefore = getAccessToken();

  return withRefreshLock(async () => {
    // Another tab may have refreshed while we waited for the lock.
    const tokenNow = getAccessToken();
    if (tokenNow && tokenNow !== tokenBefore) {
      return { token: tokenNow, user: null };
    }

    try {
      const session = await postRefresh();
      if (!session?.token) return null;
      setAccessToken(session.token);
      accessTokenListener?.(session.token);
      return session;
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;

      // `refresh_race` is a 401 that explicitly does NOT mean the session died:
      // a sibling tab rotated the cookie first and holds the live successor. The
      // server keeps the family intact for exactly this case, so treating it as
      // an expiry here would produce the multi-tab sign-out the grace window
      // exists to prevent. The next request picks up the sibling's token,
      // because the request interceptor reads storage per request.
      if (failureCode(error) === 'refresh_race') return null;

      // ONLY an authentication failure means the session is dead. A 429 from
      // the ADR-0016 global limiter, a 5xx, or an offline device must leave the
      // session intact — signing the user out because a shared NAT exhausted
      // its per-IP budget would be a self-inflicted outage.
      if (status === 401 || status === 403) {
        clearAccessToken();
        if (notifyOnExpiry) sessionExpiredListener?.();
      }
      return null;
    }
  });
};

/**
 * Renew the access token, sharing one request across concurrent callers.
 * Resolves to the new token, or `null` when renewal did not succeed.
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  // Reactive: a real request just 401'd, so a dead session here genuinely means
  // the user's session ended and they should be told.
  inFlight ??= attemptRefresh(true);

  try {
    const session = await inFlight;
    return session?.token ?? null;
  } finally {
    inFlight = null;
  }
};

/**
 * Cold-boot restore for the case the interceptor cannot reach: localStorage has
 * no access token at all, so no request is ever made and nothing can 401. That
 * happens after iOS Safari's 7-day storage eviction for non-installed sites,
 * after a storage-quota eviction, and after a "clear site data" that leaves
 * cookies — i.e. exactly the cases where an httpOnly refresh cookie is the only
 * surviving credential.
 *
 * Deliberately not gated on a "had a session" marker in localStorage: the whole
 * scenario is localStorage having been cleared.
 */
export const tryRestoreSession = async (): Promise<RefreshedSession | null> => {
  if (bootRestoreAttempted) return null;
  bootRestoreAttempted = true;

  // Speculative, so failures stay silent. Shares `inFlight` with a reactive
  // refresh on purpose: two concurrent refreshes would present the same cookie
  // and one would lose the rotation race.
  inFlight ??= attemptRefresh(false);
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};
