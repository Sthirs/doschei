type JsonResponse<T> = {
  status: number;
  body: T;
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

    throw new Error(`Backend probe failed for ${probeUrl}: ${message}`);
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
    body: (await response.json()) as T,
  };
};

export const uniqueValue = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createTestUserPayload = (prefix: string) => {
  const suffix = uniqueValue(prefix);

  return {
    email: `${suffix}@example.com`,
    password: 'password123',
    displayName: `User ${suffix}`,
  };
};

export const registerUser = async (prefix: string) =>
  createJsonRequest<{ token: string; user: { id: string; email: string; displayName: string } }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(createTestUserPayload(prefix)),
  });
