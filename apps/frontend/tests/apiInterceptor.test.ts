/**
 * The renew-and-retry response interceptor on the shared axios instance
 * (ADR-0023).
 *
 * With a one-hour access token this path runs for any session older than an
 * hour, so it must be invisible: one refresh, one retry, and the caller never
 * sees the 401. Two guards keep it from doing harm:
 *
 *  - Retry EXACTLY once. Without the marker, a persistently-401ing endpoint
 *    would loop.
 *  - Never refresh for /auth/login. That endpoint answers 401 for wrong
 *    credentials, so a failed sign-in would otherwise trigger a rotation —
 *    on a shared device, of somebody else's live session.
 *
 * The transport is stubbed by swapping `api.defaults.adapter`, which needs no
 * extra dependency: a custom adapter owns status handling, so it rejects with a
 * real `AxiosError` exactly as the built-in adapters do.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

import { api } from '@/lib/api';
import * as sessionRefresh from '@/lib/sessionRefresh';

const TOKEN_KEY = 'doschei.auth.token';

type Reply = { status: number; data?: unknown };

const memStore: Record<string, string> = {};
let replies: Reply[] = [];
// Header VALUES are captured, not the config object: axios reuses (and mutates)
// the same config across the retry, so holding references would show every
// attempt carrying the final token.
let sent: Array<{ url?: string; auth: string }> = [];
let originalAdapter: AxiosAdapter | undefined;
let refreshSpy: ReturnType<typeof vi.spyOn>;

const stubAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  sent.push({
    url: config.url,
    auth: String(config.headers?.Authorization ?? ''),
  });
  const reply = replies.shift() ?? { status: 200, data: {} };
  const response = {
    data: reply.data ?? {},
    status: reply.status,
    statusText: '',
    headers: {},
    config,
  };

  if (reply.status >= 200 && reply.status < 300) return response;

  throw new AxiosError(
    `Request failed with status code ${reply.status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    response,
  );
};

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in memStore ? memStore[k] : null),
    setItem: (k: string, v: string) => {
      memStore[k] = String(v);
    },
    removeItem: (k: string) => {
      delete memStore[k];
    },
    clear: () => undefined,
  });
  memStore[TOKEN_KEY] = 'expired-token';
  replies = [];
  sent = [];
  originalAdapter = api.defaults.adapter as AxiosAdapter | undefined;
  api.defaults.adapter = stubAdapter;
  refreshSpy = vi.spyOn(sessionRefresh, 'refreshAccessToken');
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('401 on a protected endpoint', () => {
  it('refreshes once and retries with the NEW bearer token', async () => {
    refreshSpy.mockImplementation(async () => {
      memStore[TOKEN_KEY] = 'rotated-token';
      return 'rotated-token';
    });
    replies = [{ status: 401 }, { status: 200, data: [{ id: 'g1' }] }];

    const response = await api.get('/groups');

    expect(response.status).toBe(200);
    expect(response.data).toEqual([{ id: 'g1' }]);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.auth).toBe('Bearer rotated-token');
  });

  it('re-signs the retry from storage, not from the value it was handed', async () => {
    // The retry re-enters the request interceptor, which reads storage. This is
    // the coupling that makes `refreshAccessToken` persist the rotated token
    // BEFORE it resolves: a refresh that only returned the token would leave
    // the retry sending the stale one.
    refreshSpy.mockResolvedValue('returned-but-not-persisted');
    replies = [{ status: 401 }, { status: 200 }];

    await api.get('/groups');

    expect(sent[0]?.auth).toBe('Bearer expired-token');
    expect(sent[1]?.auth).toBe('Bearer expired-token');
  });

  it('propagates the error without retrying when the refresh fails', async () => {
    refreshSpy.mockResolvedValue(null);
    replies = [{ status: 401 }];

    await expect(api.get('/groups')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(sent).toHaveLength(1);
  });

  it('retries exactly once — a second 401 does NOT trigger a second refresh', async () => {
    refreshSpy.mockResolvedValue('rotated-token');
    replies = [{ status: 401 }, { status: 401 }, { status: 401 }];

    await expect(api.get('/groups')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
  });
});

describe('paths that must never trigger a refresh', () => {
  it.each([
    ['/auth/login (wrong password)', '/auth/login'],
    ['/auth/register', '/auth/register'],
    ['/auth/session/logout', '/auth/session/logout'],
    ['/auth/session/refresh', '/auth/session/refresh'],
  ])('a 401 from %s does not refresh', async (_label, url) => {
    refreshSpy.mockResolvedValue('rotated-token');
    replies = [{ status: 401 }];

    await expect(api.post(url, {})).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});

describe('statuses that are not an expired token', () => {
  it.each([
    ['403 forbidden', 403],
    ['404 not found', 404],
    ['429 rate limited', 429],
    ['500 server error', 500],
  ])('%s propagates untouched', async (_label, status) => {
    refreshSpy.mockResolvedValue('rotated-token');
    replies = [{ status }];

    await expect(api.get('/groups')).rejects.toMatchObject({
      response: { status },
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('a successful response is passed straight through', async () => {
    replies = [{ status: 200, data: [{ id: 'g1' }] }];

    const response = await api.get('/groups');

    expect(response.data).toEqual([{ id: 'g1' }]);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
