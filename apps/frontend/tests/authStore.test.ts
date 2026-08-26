import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import type { AuthUser } from '@/types/auth';

// Mock the api module
const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// Mock i18n
vi.mock('@/i18n', () => ({
  normalizeLocale: (locale: string) => locale,
  setAppLocale: vi.fn(),
}));

// Mock localStorage (happy-dom lacks it)
const memStore: Record<string, string> = {};
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in memStore ? memStore[k] : null),
    setItem: (k: string, v: string) => { memStore[k] = String(v); },
    removeItem: (k: string) => { delete memStore[k]; },
    clear: () => { for (const k of Object.keys(memStore)) delete memStore[k]; },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const TOKEN_KEY = 'doschei.auth.token';

const makeUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'user-1',
  email: 'alice@test.com',
  displayName: 'Alice',
  language: 'en',
  imageUrl: null,
  ...overrides,
});

const makeAxiosError = (status: number, message = 'Request failed') => {
  const error = new Error(message) as Error & {
    response?: { status: number };
    isAxiosError: boolean;
  };
  error.response = { status };
  error.isAxiosError = true;
  return error;
};

const makeNetworkError = (message = 'Network Error') => {
  const error = new Error(message) as Error & {
    response?: undefined;
    isAxiosError: boolean;
  };
  error.isAxiosError = true;
  return error;
};

describe('useAuthStore fetchCurrentUser', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('(a) 401 → token removed from localStorage + state cleared', async () => {
    const authStore = useAuthStore();
    const user = makeUser();
    authStore.token = 'test-token-401';
    authStore.user = user;
    localStorage.setItem(TOKEN_KEY, 'test-token-401');

    mockApiGet.mockRejectedValueOnce(makeAxiosError(401, 'Unauthorized'));

    const result = await authStore.fetchCurrentUser();

    expect(result).toBeNull();
    expect(authStore.token).toBe('');
    expect(authStore.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('(b) 403 → token removed from localStorage + state cleared', async () => {
    const authStore = useAuthStore();
    const user = makeUser();
    authStore.token = 'test-token-403';
    authStore.user = user;
    localStorage.setItem(TOKEN_KEY, 'test-token-403');

    mockApiGet.mockRejectedValueOnce(makeAxiosError(403, 'Forbidden'));

    const result = await authStore.fetchCurrentUser();

    expect(result).toBeNull();
    expect(authStore.token).toBe('');
    expect(authStore.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('(c) rejected promise without response (network) → token PRESERVED, user PRESERVED, no logout', async () => {
    const authStore = useAuthStore();
    const user = makeUser();
    authStore.token = 'test-token-network';
    authStore.user = user;
    localStorage.setItem(TOKEN_KEY, 'test-token-network');

    mockApiGet.mockRejectedValueOnce(makeNetworkError('Network Error'));

    const result = await authStore.fetchCurrentUser();

    expect(result).toBeNull();
    expect(authStore.token).toBe('test-token-network');
    expect(authStore.user).toStrictEqual(user);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token-network');
  });

  it('(d) 500 → token and user PRESERVED', async () => {
    const authStore = useAuthStore();
    const user = makeUser();
    authStore.token = 'test-token-500';
    authStore.user = user;
    localStorage.setItem(TOKEN_KEY, 'test-token-500');

    mockApiGet.mockRejectedValueOnce(makeAxiosError(500, 'Internal Server Error'));

    const result = await authStore.fetchCurrentUser();

    expect(result).toBeNull();
    expect(authStore.token).toBe('test-token-500');
    expect(authStore.user).toStrictEqual(user);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token-500');
  });

  it('(e) 429 → token and user PRESERVED', async () => {
    const authStore = useAuthStore();
    const user = makeUser();
    authStore.token = 'test-token-429';
    authStore.user = user;
    localStorage.setItem(TOKEN_KEY, 'test-token-429');

    mockApiGet.mockRejectedValueOnce(makeAxiosError(429, 'Too Many Requests'));

    const result = await authStore.fetchCurrentUser();

    expect(result).toBeNull();
    expect(authStore.token).toBe('test-token-429');
    expect(authStore.user).toStrictEqual(user);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token-429');
  });

  it('(f) success → user set, locale applied', async () => {
    const authStore = useAuthStore();
    const user = makeUser({ language: 'de' });
    authStore.token = 'test-token-success';
    localStorage.setItem(TOKEN_KEY, 'test-token-success');

    mockApiGet.mockResolvedValueOnce({ data: { user } });

    const result = await authStore.fetchCurrentUser();

    expect(result).toEqual(user);
    expect(authStore.token).toBe('test-token-success');
    expect(authStore.user).toEqual(user);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token-success');
  });
});
