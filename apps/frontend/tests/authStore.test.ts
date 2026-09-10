import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import type { AuthUser } from '@/types/auth';

// Mock the api module. `post` is required as well as `get`: ADR-0023's
// logout() calls POST /auth/session/logout for server-side revocation.
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// ADR-0023 cold-boot restore. Stubbed here so the store's delegation is
// asserted without a network layer; lib/sessionRefresh has its own suite.
const mockRestoreSession = vi.fn();
const mockSuppressRestore = vi.fn();
vi.mock('@/lib/sessionRefresh', () => ({
  tryRestoreSession: (...args: unknown[]) => mockRestoreSession(...args),
  suppressSessionRestore: () => mockSuppressRestore(),
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
  mockApiPost.mockReset();
  mockRestoreSession.mockReset();
  mockSuppressRestore.mockReset();
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

describe('auth store — sign-out (ADR-0023)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });


  it('logout() revokes the refresh family server-side, then clears locally', async () => {
    memStore[TOKEN_KEY] = 'live-token';
    mockApiPost.mockResolvedValue({ data: undefined });
    const store = useAuthStore();
    store.user = makeUser();

    await store.logout();

    expect(mockApiPost).toHaveBeenCalledWith('/auth/session/logout');
    expect(store.token).toBe('');
    expect(store.user).toBeNull();
    expect(memStore[TOKEN_KEY]).toBeUndefined();
    // Without this the router guard would speculatively try to restore the
    // session on the very next navigation and land the user on
    // /login?error=expired after a deliberate sign-out.
    expect(mockSuppressRestore).toHaveBeenCalledTimes(1);
  });

  it('logout() still clears locally when the revocation request fails', async () => {
    // Offline, or the cookie was already dead. Signing out locally is the part
    // the user actually asked for, so it must not depend on the network.
    memStore[TOKEN_KEY] = 'live-token';
    mockApiPost.mockRejectedValue(new Error('offline'));
    const store = useAuthStore();
    store.user = makeUser();

    await expect(store.logout()).resolves.toBeUndefined();
    expect(store.token).toBe('');
    expect(memStore[TOKEN_KEY]).toBeUndefined();
  });

  it('clearSession() makes NO network call', () => {
    memStore[TOKEN_KEY] = 'live-token';
    const store = useAuthStore();
    store.user = makeUser();

    store.clearSession();

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(store.token).toBe('');
    expect(store.user).toBeNull();
    expect(memStore[TOKEN_KEY]).toBeUndefined();
  });

  it("fetchCurrentUser's 401 branch uses clearSession, not logout", async () => {
    // Firing a logout request with a token the server just rejected would be a
    // pointless round trip.
    memStore[TOKEN_KEY] = 'dead-token';
    mockApiGet.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    });
    const store = useAuthStore();

    await store.fetchCurrentUser();

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(store.token).toBe('');
  });
});

describe('auth store — setToken (ADR-0023)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });


  it('updates state and storage so isAuthenticated stays honest', () => {
    const store = useAuthStore();

    store.setToken('rotated-token');

    expect(store.token).toBe('rotated-token');
    expect(store.isAuthenticated).toBe(true);
    expect(memStore[TOKEN_KEY]).toBe('rotated-token');
  });
});

describe('auth store — tryRestoreSession (ADR-0023)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });


  it('adopts the token and user from a successful restore', async () => {
    const user = makeUser({ language: 'it' });
    mockRestoreSession.mockResolvedValue({ token: 'restored', user });
    const store = useAuthStore();

    const result = await store.tryRestoreSession();

    expect(result).toEqual(user);
    expect(store.token).toBe('restored');
    expect(store.user).toEqual(user);
  });

  it('falls back to /auth/me when a sibling tab won the refresh (no user in body)', async () => {
    const user = makeUser();
    mockRestoreSession.mockResolvedValue({ token: 'restored', user: null });
    mockApiGet.mockResolvedValue({ data: { user } });
    const store = useAuthStore();

    const result = await store.tryRestoreSession();

    expect(mockApiGet).toHaveBeenCalledWith('/auth/me');
    expect(result).toEqual(user);
    expect(store.token).toBe('restored');
  });

  it('leaves the store signed out when there is no session to restore', async () => {
    mockRestoreSession.mockResolvedValue(null);
    const store = useAuthStore();

    expect(await store.tryRestoreSession()).toBeNull();
    expect(store.token).toBe('');
    expect(store.isAuthenticated).toBe(false);
  });
});
