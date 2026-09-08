/**
 * Silent access-token renewal (ADR-0023).
 *
 * The properties pinned here are the ones that decide whether the feature is a
 * quality-of-life win or an outage generator:
 *
 *  - One refresh per burst of 401s, not one per request.
 *  - ONLY 401/403 ends the session. A 429 from the ADR-0016 global per-IP
 *    limiter, a 5xx, or an offline device must leave the session intact —
 *    behind shared NAT a whole office shares one rate-limit bucket, and
 *    treating a 429 as "expired" would sign all of them out at once.
 *  - The cross-tab lock short-circuits when a sibling tab already refreshed,
 *    so the two tabs do not race each other into reuse detection.
 *  - The cold-boot restore runs at most once per page load, so there is no
 *    path to a refresh storm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

import {
  onAccessTokenChange,
  onSessionExpired,
  refreshAccessToken,
  resetSessionRefreshState,
  suppressSessionRestore,
  tryRestoreSession,
} from '@/lib/sessionRefresh';
import type { AuthUser } from '@/types/auth';

const TOKEN_KEY = 'doschei.auth.token';
const REFRESH_URL = '/api/auth/session/refresh';

const memStore: Record<string, string> = {};

const user: AuthUser = {
  id: 'u1',
  email: 'u@doschei.local',
  displayName: 'Demo',
  language: 'en',
  imageUrl: null,
};

const makeAxiosError = (status?: number, code?: string) => {
  const error = new Error(status ? `HTTP ${status}` : 'Network Error') as Error & {
    isAxiosError: boolean;
    response?: { status: number; data?: { code: string } };
  };
  error.isAxiosError = true;
  if (status !== undefined) {
    error.response = { status, ...(code ? { data: { code } } : {}) };
  }
  return error;
};

let postSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const key of Object.keys(memStore)) delete memStore[key];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in memStore ? memStore[k] : null),
    setItem: (k: string, v: string) => {
      memStore[k] = String(v);
    },
    removeItem: (k: string) => {
      delete memStore[k];
    },
    clear: () => {
      for (const k of Object.keys(memStore)) delete memStore[k];
    },
  });
  // happy-dom has no Web Locks API, so the default path here is the in-tab
  // fallback; the lock is exercised explicitly further down.
  vi.stubGlobal('navigator', {});
  resetSessionRefreshState();
  onAccessTokenChange(() => undefined);
  onSessionExpired(() => undefined);
  postSpy = vi.spyOn(axios, 'post');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('refreshAccessToken — success', () => {
  it('stores the rotated token and notifies the listener', async () => {
    const seen: string[] = [];
    onAccessTokenChange((token) => seen.push(token));
    postSpy.mockResolvedValue({ data: { token: 'rotated', user } });

    expect(await refreshAccessToken()).toBe('rotated');
    expect(memStore[TOKEN_KEY]).toBe('rotated');
    expect(seen).toEqual(['rotated']);
  });

  it('sends credentials to the session endpoint with no body', async () => {
    postSpy.mockResolvedValue({ data: { token: 'rotated', user } });

    await refreshAccessToken();

    expect(postSpy).toHaveBeenCalledWith(REFRESH_URL, null, {
      withCredentials: true,
    });
  });

  it('de-duplicates a burst of concurrent callers into ONE request', async () => {
    postSpy.mockResolvedValue({ data: { token: 'rotated', user } });

    const results = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(5).fill('rotated'));
  });

  it('allows a later, separate refresh once the first has settled', async () => {
    postSpy.mockResolvedValue({ data: { token: 'rotated', user } });

    await refreshAccessToken();
    await refreshAccessToken();

    expect(postSpy).toHaveBeenCalledTimes(2);
  });
});

describe('refreshAccessToken — failure classification', () => {
  it('401 clears the token and reports the session expired', async () => {
    memStore[TOKEN_KEY] = 'stale';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(401));

    expect(await refreshAccessToken()).toBeNull();
    expect(memStore[TOKEN_KEY]).toBeUndefined();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('403 is treated the same as 401', async () => {
    memStore[TOKEN_KEY] = 'stale';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(403));

    expect(await refreshAccessToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['429 rate limit', 429],
    ['500 server error', 500],
    ['503 during a deploy', 503],
  ])('%s PRESERVES the session', async (_label, status) => {
    memStore[TOKEN_KEY] = 'still-good';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(status));

    expect(await refreshAccessToken()).toBeNull();
    expect(memStore[TOKEN_KEY]).toBe('still-good');
    expect(expired).not.toHaveBeenCalled();
  });

  it('a network error with no response PRESERVES the session', async () => {
    memStore[TOKEN_KEY] = 'still-good';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(undefined));

    expect(await refreshAccessToken()).toBeNull();
    expect(memStore[TOKEN_KEY]).toBe('still-good');
    expect(expired).not.toHaveBeenCalled();
  });

  it('a response without a token is a failure, not a silent success', async () => {
    postSpy.mockResolvedValue({ data: { user } });

    expect(await refreshAccessToken()).toBeNull();
    expect(memStore[TOKEN_KEY]).toBeUndefined();
  });
});

describe('refreshAccessToken — cross-tab lock', () => {
  it('runs the refresh inside the named Web Lock when available', async () => {
    const request = vi.fn(
      async (_name: string, run: () => Promise<unknown>) => run(),
    );
    vi.stubGlobal('navigator', { locks: { request } });
    postSpy.mockResolvedValue({ data: { token: 'rotated', user } });

    await refreshAccessToken();

    expect(request).toHaveBeenCalledWith(
      'doschei.auth.refresh',
      expect.any(Function),
    );
  });

  it('short-circuits with no request when a sibling tab already refreshed', async () => {
    memStore[TOKEN_KEY] = 'old';
    // Simulate the sibling tab winning while we waited for the lock.
    const request = vi.fn(async (_name: string, run: () => Promise<unknown>) => {
      memStore[TOKEN_KEY] = 'refreshed-by-other-tab';
      return run();
    });
    vi.stubGlobal('navigator', { locks: { request } });

    expect(await refreshAccessToken()).toBe('refreshed-by-other-tab');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('falls back to an unlocked refresh when Web Locks is missing', async () => {
    vi.stubGlobal('navigator', {});
    postSpy.mockResolvedValue({ data: { token: 'rotated', user } });

    expect(await refreshAccessToken()).toBe('rotated');
  });
});

describe('tryRestoreSession', () => {
  it('returns the restored session on the first attempt', async () => {
    postSpy.mockResolvedValue({ data: { token: 'restored', user } });

    expect(await tryRestoreSession()).toEqual({ token: 'restored', user });
    expect(memStore[TOKEN_KEY]).toBe('restored');
  });

  it('runs at most once per page load, even after a failure', async () => {
    postSpy.mockRejectedValue(makeAxiosError(401));

    expect(await tryRestoreSession()).toBeNull();
    expect(await tryRestoreSession()).toBeNull();
    expect(await tryRestoreSession()).toBeNull();

    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry after a successful restore either', async () => {
    postSpy.mockResolvedValue({ data: { token: 'restored', user } });

    await tryRestoreSession();
    expect(await tryRestoreSession()).toBeNull();

    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('is attemptable again after resetSessionRefreshState (test seam)', async () => {
    postSpy.mockResolvedValue({ data: { token: 'restored', user } });

    await tryRestoreSession();
    resetSessionRefreshState();
    await tryRestoreSession();

    expect(postSpy).toHaveBeenCalledTimes(2);
  });
});

describe('refresh_race — the multi-tab denial that is NOT an expiry', () => {
  it('preserves the session and does not report an expiry', async () => {
    // The server answers 401 refresh_race when a sibling tab already rotated the
    // cookie, and deliberately keeps the family alive. Treating it as an expiry
    // would sign the user out of every tab — the exact outcome the grace window
    // exists to prevent.
    memStore[TOKEN_KEY] = 'still-good';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(401, 'refresh_race'));

    expect(await refreshAccessToken()).toBeNull();
    expect(memStore[TOKEN_KEY]).toBe('still-good');
    expect(expired).not.toHaveBeenCalled();
  });

  it('still ends the session for a 401 that is a real denial', async () => {
    memStore[TOKEN_KEY] = 'stale';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(401, 'refresh_reuse'));

    expect(await refreshAccessToken()).toBeNull();
    expect(memStore[TOKEN_KEY]).toBeUndefined();
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

describe('speculative restore vs reactive refresh', () => {
  it('a failed cold-boot restore does NOT report an expiry', async () => {
    // A visitor who was never signed in has nothing to expire. Reporting it
    // would redirect them to /login?error=expired and claim their session ran
    // out when they never had one.
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(401, 'missing_refresh_token'));

    expect(await tryRestoreSession()).toBeNull();
    expect(expired).not.toHaveBeenCalled();
  });

  it('a failed reactive refresh DOES report an expiry', async () => {
    memStore[TOKEN_KEY] = 'stale';
    const expired = vi.fn();
    onSessionExpired(expired);
    postSpy.mockRejectedValue(makeAxiosError(401, 'expired_refresh_token'));

    expect(await refreshAccessToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

describe('suppressSessionRestore', () => {
  it('stops a restore attempt after an explicit sign-out', async () => {
    suppressSessionRestore();

    expect(await tryRestoreSession()).toBeNull();
    expect(postSpy).not.toHaveBeenCalled();
  });
});
