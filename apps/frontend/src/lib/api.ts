import axios, { type InternalAxiosRequestConfig } from 'axios';

import { getAccessToken } from '@/lib/authToken';
import { refreshAccessToken } from '@/lib/sessionRefresh';

/**
 * `withCredentials` so the ADR-0023 refresh cookie survives a future
 * cross-origin split. Every environment is same-origin behind one ingress
 * today (and the Vite dev server proxies `/api`), so this changes nothing now.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

/** Marker so a retried request can never be retried a second time. */
type RetryableConfig = InternalAxiosRequestConfig & {
  doscheiRetried?: boolean;
};

/**
 * Endpoints where a 401 is a legitimate answer rather than an expired token.
 *
 * `/auth/login` returning 401 for wrong credentials is the important one:
 * without this guard every failed sign-in would fire a refresh, and on a shared
 * device that could rotate — and so invalidate — somebody else's live session.
 * `/auth/session/*` is excluded to keep the interceptor from recursing.
 */
const isAuthPath = (url: string | undefined): boolean => {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/session/')
  );
};

api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Renew-and-retry on 401 (ADR-0023). With a one-hour access token this is the
 * ordinary path for any session older than an hour, so it has to be invisible:
 * one refresh, one retry, and the original caller never sees the 401.
 */
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error)) throw error;

  const config = error.config as RetryableConfig | undefined;

  if (
    !config ||
    error.response?.status !== 401 ||
    config.doscheiRetried ||
    isAuthPath(config.url)
  ) {
    throw error;
  }

  const token = await refreshAccessToken();
  if (!token) throw error;

  // The retry goes back through `api.request`, so the request interceptor above
  // re-signs it from storage — which is why `refreshAccessToken` persists the
  // rotated token before it resolves. Setting the header here as well would be
  // dead code: the interceptor runs afterwards and overwrites it.
  config.doscheiRetried = true;

  return api.request(config);
});
