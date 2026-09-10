type JsonResponse<T> = {
  status: number;
  body: T;
  /**
   * Purely additive — every existing caller destructures `{ status, body }`.
   * Needed by the ADR-0023 session specs, which assert on `Set-Cookie`.
   */
  headers: Headers;
};

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

const requiredBaseUrl = process.env.BACKEND_BASE_URL;

if (!requiredBaseUrl) {
  throw new Error('BACKEND_BASE_URL is required for integration tests.');
}

let parsedBaseUrl: URL;

try {
  parsedBaseUrl = new URL(requiredBaseUrl);
} catch {
  throw new Error(`BACKEND_BASE_URL is not a valid URL: ${requiredBaseUrl}`);
}

export const baseUrl = trimTrailingSlash(parsedBaseUrl.toString());

export const ensureBackendAvailable = async (): Promise<void> => {
  const probeUrl = `${baseUrl}/api/groups`;
  let response: Response;

  try {
    response = await fetch(probeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown network error';

    throw new Error(`Backend probe failed for ${probeUrl}: ${message}`, { cause: error });
  }

  if (response.status !== 200 && response.status !== 401) {
    throw new Error(`Backend probe failed at ${probeUrl} with status ${response.status}`);
  }
};

export const createJsonRequest = async <T>(
  path: string,
  init?: RequestInit,
): Promise<JsonResponse<T>> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  return {
    status: response.status,
    body: (response.status === 204 ? {} : (await response.json())) as T,
    headers: response.headers,
  };
};

/**
 * Creates a multipart/form-data request for file uploads.
 * Does NOT set a content-type header — fetch will set it with the correct boundary.
 */
export const createMultipartRequest = async <T>(
  path: string,
  formData: FormData,
  token?: string,
): Promise<JsonResponse<T>> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    body: formData,
    headers,
  });

  return {
    status: response.status,
    body: (response.status === 204 ? {} : (await response.json())) as T,
    headers: response.headers,
  };
};

/**
 * Performs a raw fetch against the backend and returns the response text
 * without JSON parsing, for non-JSON responses such as CSV.
 */
export const createRawRequest = async (
  path: string,
  init?: RequestInit,
): Promise<{ status: number; headers: Headers; text: string }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });

  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  };
};

export const uniqueValue = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createTestUserPayload = (prefix: string, options?: { language?: string }) => {
  const suffix = uniqueValue(prefix);

  return {
    email: `${suffix}@example.com`,
    password: 'password123',
    displayName: `User ${suffix}`,
    ...(options?.language !== undefined ? { language: options.language } : {}),
  };
};

export const registerUser = async (prefix: string) =>
  createJsonRequest<{
    token: string;
    user: { id: string; email: string; displayName: string; language: 'en' | 'it' };
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(createTestUserPayload(prefix)),
  });

/**
 * The full `Set-Cookie` line for `name`, or undefined. ADR-0023 helpers.
 */
export const readSetCookie = (headers: Headers, name: string): string | undefined =>
  headers.getSetCookie().find((line) => line.startsWith(`${name}=`));

/** The value of a `Set-Cookie` line, up to the first attribute. */
export const cookieValue = (setCookieLine: string): string =>
  setCookieLine.slice(setCookieLine.indexOf('=') + 1).split(';')[0];

/** A `Cookie:` request header carrying one cookie. */
export const cookieHeader = (name: string, value: string): { cookie: string } => ({
  cookie: `${name}=${value}`,
});

/**
 * True when the line tells the browser to drop the cookie (empty value, or an
 * expiry in the past).
 */
export const isClearingCookie = (setCookieLine: string): boolean =>
  cookieValue(setCookieLine) === '' ||
  /Expires=Thu, 01 Jan 1970/.test(setCookieLine) ||
  /Max-Age=0/.test(setCookieLine);

export const REFRESH_COOKIE_NAME = 'doschei.auth.refresh';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
