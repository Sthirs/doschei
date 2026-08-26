import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  STORED_BUILD_KEY,
  RELOAD_GUARD_KEY,
  MIN_CHECK_INTERVAL_MS,
  decideVersionAction,
  checkForNewBuild,
  shouldRunCheck,
  createBrowserPorts,
  type AppVersionPorts,
  type VersionAction,
} from '@/lib/appVersion';

describe('decideVersionAction (pure)', () => {
  it('returns skip when remote is null', () => {
    expect(decideVersionAction('abc', null)).toBe('skip');
    expect(decideVersionAction(null, null)).toBe('skip');
  });

  it('returns store when stored === remote', () => {
    expect(decideVersionAction('abc', 'abc')).toBe('store');
    expect(decideVersionAction(null, null)).toBe('skip'); // covered above, but explicit
  });

  it('returns purge-and-reload when stored !== remote', () => {
    expect(decideVersionAction('old', 'new')).toBe('purge-and-reload');
    expect(decideVersionAction(null, 'new')).toBe('purge-and-reload');
    expect(decideVersionAction('old', 'different')).toBe('purge-and-reload');
  });
});

describe('shouldRunCheck (throttle)', () => {
  it('returns true when lastMs is undefined (first run)', () => {
    expect(shouldRunCheck(1000, undefined)).toBe(true);
  });

  it('returns true when delta >= MIN_CHECK_INTERVAL_MS', () => {
    expect(shouldRunCheck(30_000, 0)).toBe(true);
    expect(shouldRunCheck(60_000, 29_999)).toBe(true);
    expect(shouldRunCheck(100_000, 50_000)).toBe(true);
  });

  it('returns false when delta < MIN_CHECK_INTERVAL_MS', () => {
    expect(shouldRunCheck(29_999, 0)).toBe(false);
    expect(shouldRunCheck(30_000, 1)).toBe(false);
    expect(shouldRunCheck(59_999, 30_000)).toBe(false);
  });
});

describe('checkForNewBuild (orchestrator)', () => {
  const makePorts = (overrides: Partial<AppVersionPorts> = {}): AppVersionPorts => ({
    fetchRemoteBuildId: vi.fn().mockResolvedValue('remote-123'),
    getStoredBuildId: vi.fn().mockReturnValue('stored-123'),
    storeBuildId: vi.fn(),
    hasReloadGuard: vi.fn().mockReturnValue(false),
    armReloadGuard: vi.fn(),
    clearReloadGuard: vi.fn(),
    purgeCachesAndWorkers: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchRemoteBuildId returns null → skip, zero side effects', async () => {
    const ports = makePorts({ fetchRemoteBuildId: vi.fn().mockResolvedValue(null) });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip');
    expect(ports.getStoredBuildId).not.toHaveBeenCalled();
    expect(ports.storeBuildId).not.toHaveBeenCalled();
    expect(ports.purgeCachesAndWorkers).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
    expect(ports.armReloadGuard).not.toHaveBeenCalled();
    expect(ports.clearReloadGuard).not.toHaveBeenCalled();
  });

  it('fetchRemoteBuildId throws → skip, zero side effects', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockRejectedValue(new Error('network down')),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip');
    expect(ports.getStoredBuildId).not.toHaveBeenCalled();
    expect(ports.storeBuildId).not.toHaveBeenCalled();
    expect(ports.purgeCachesAndWorkers).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('stored === remote → store, clears guard, no purge/reload', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('same-id'),
      getStoredBuildId: vi.fn().mockReturnValue('same-id'),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('store');
    expect(ports.clearReloadGuard).toHaveBeenCalledTimes(1);
    expect(ports.purgeCachesAndWorkers).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
    expect(ports.armReloadGuard).not.toHaveBeenCalled();
    expect(ports.storeBuildId).not.toHaveBeenCalled(); // already stored
  });

  it('mismatch, no guard → purge-and-reload: purges, stores, arms guard, reloads exactly once', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('new-build'),
      getStoredBuildId: vi.fn().mockReturnValue('old-build'),
      hasReloadGuard: vi.fn().mockReturnValue(false),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('purge-and-reload');
    expect(ports.purgeCachesAndWorkers).toHaveBeenCalledTimes(1);
    expect(ports.storeBuildId).toHaveBeenCalledWith('new-build');
    expect(ports.armReloadGuard).toHaveBeenCalledTimes(1);
    expect(ports.reload).toHaveBeenCalledTimes(1);
    expect(ports.clearReloadGuard).not.toHaveBeenCalled();
  });

  it('mismatch, guard armed → skip-healed: stores new id, no purge/reload', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('new-build'),
      getStoredBuildId: vi.fn().mockReturnValue('old-build'),
      hasReloadGuard: vi.fn().mockReturnValue(true),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip-healed');
    expect(ports.storeBuildId).toHaveBeenCalledWith('new-build');
    expect(ports.purgeCachesAndWorkers).not.toHaveBeenCalled();
    expect(ports.reload).not.toHaveBeenCalled();
    expect(ports.armReloadGuard).not.toHaveBeenCalled();
    expect(ports.clearReloadGuard).not.toHaveBeenCalled();
  });

  it('purgeCachesAndWorkers throws → skip, no reload', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('new-build'),
      getStoredBuildId: vi.fn().mockReturnValue('old-build'),
      hasReloadGuard: vi.fn().mockReturnValue(false),
      purgeCachesAndWorkers: vi.fn().mockRejectedValue(new Error('cache delete failed')),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip');
    expect(ports.reload).not.toHaveBeenCalled();
    expect(ports.armReloadGuard).not.toHaveBeenCalled();
  });

  it('storeBuildId throws → skip, no reload', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('new-build'),
      getStoredBuildId: vi.fn().mockReturnValue('old-build'),
      hasReloadGuard: vi.fn().mockReturnValue(false),
      storeBuildId: vi.fn().mockImplementation(() => {
        throw new Error('quota exceeded');
      }),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip');
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('armReloadGuard throws → skip, no reload', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('new-build'),
      getStoredBuildId: vi.fn().mockReturnValue('old-build'),
      hasReloadGuard: vi.fn().mockReturnValue(false),
      armReloadGuard: vi.fn().mockImplementation(() => {
        throw new Error('sessionStorage disabled');
      }),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip');
    expect(ports.reload).not.toHaveBeenCalled();
  });

  it('reload throws → skip (error swallowed)', async () => {
    const ports = makePorts({
      fetchRemoteBuildId: vi.fn().mockResolvedValue('new-build'),
      getStoredBuildId: vi.fn().mockReturnValue('old-build'),
      hasReloadGuard: vi.fn().mockReturnValue(false),
      reload: vi.fn().mockImplementation(() => {
        throw new Error('location.reload blocked');
      }),
    });
    const action = await checkForNewBuild(ports);
    expect(action).toBe('skip');
  });
});

describe('createBrowserPorts (factory)', () => {
  const originalGlobalThis = globalThis;
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  const originalCaches = (globalThis as { caches?: CacheStorage }).caches;

  beforeEach(() => {
    vi.resetModules();
    // Reset globals to clean state
    (globalThis as { localStorage?: Storage }).localStorage = undefined;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = undefined;
    (globalThis as { caches?: CacheStorage }).caches = undefined;
    (globalThis as { navigator?: Navigator }).navigator = undefined;
    (globalThis as { window?: Window & typeof globalThis }).window = undefined;
  });

  afterAll(() => {
    // Restore
    (globalThis as { localStorage?: Storage }).localStorage = originalGlobalThis.localStorage;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = originalGlobalThis.sessionStorage;
    (globalThis as { caches?: CacheStorage }).caches = originalCaches;
    (globalThis as { navigator?: Navigator }).navigator = originalNavigator;
    (globalThis as { window?: Window & typeof globalThis }).window = originalWindow;
  });

  it('fetchRemoteBuildId: ok response with buildId → returns id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ buildId: 'build-456' }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetch;

    const ports = createBrowserPorts();
    const id = await ports.fetchRemoteBuildId();
    expect(id).toBe('build-456');
    expect(mockFetch).toHaveBeenCalledWith('/app-version.json', { cache: 'no-store' });
  });

  it('fetchRemoteBuildId: non-ok response → null', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetch;

    const ports = createBrowserPorts();
    const id = await ports.fetchRemoteBuildId();
    expect(id).toBeNull();
  });

  it('fetchRemoteBuildId: fetch throws → null', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetch;

    const ports = createBrowserPorts();
    const id = await ports.fetchRemoteBuildId();
    expect(id).toBeNull();
  });

  it('fetchRemoteBuildId: missing buildId in JSON → null', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ otherField: 'value' }),
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetch;

    const ports = createBrowserPorts();
    const id = await ports.fetchRemoteBuildId();
    expect(id).toBeNull();
  });

  it('getStoredBuildId / storeBuildId use localStorage with STORED_BUILD_KEY', () => {
    const store = new Map<string, string>();
    const localStorage = {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => store.set(k, v)),
      removeItem: vi.fn((k: string) => store.delete(k)),
    };
    (globalThis as { localStorage?: Storage }).localStorage = localStorage as unknown as Storage;

    const ports = createBrowserPorts();
    expect(ports.getStoredBuildId()).toBeNull();

    ports.storeBuildId('build-789');
    expect(localStorage.setItem).toHaveBeenCalledWith(STORED_BUILD_KEY, 'build-789');
    expect(ports.getStoredBuildId()).toBe('build-789');
    expect(localStorage.getItem).toHaveBeenCalledWith(STORED_BUILD_KEY);
  });

  it('hasReloadGuard / armReloadGuard / clearReloadGuard use sessionStorage with RELOAD_GUARD_KEY', () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => store.set(k, v)),
      removeItem: vi.fn((k: string) => store.delete(k)),
    };
    (globalThis as { sessionStorage?: Storage }).sessionStorage = sessionStorage as unknown as Storage;

    const ports = createBrowserPorts();
    expect(ports.hasReloadGuard()).toBe(false);

    ports.armReloadGuard();
    expect(sessionStorage.setItem).toHaveBeenCalledWith(RELOAD_GUARD_KEY, '1');
    expect(ports.hasReloadGuard()).toBe(true);

    ports.clearReloadGuard();
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(RELOAD_GUARD_KEY);
    expect(ports.hasReloadGuard()).toBe(false);
  });

  it('purgeCachesAndWorkers deletes all caches and unregisters all SWs', async () => {
    const cacheKeys = ['cache-v1', 'cache-v2'];
    const mockCaches = {
      keys: vi.fn().mockResolvedValue(cacheKeys),
      delete: vi.fn().mockResolvedValue(true),
    };
    (globalThis as { caches?: CacheStorage }).caches = mockCaches as unknown as CacheStorage;

    const mockRegistrations = [
      { unregister: vi.fn().mockResolvedValue(true) },
      { unregister: vi.fn().mockResolvedValue(true) },
    ];
    const mockNavigator = {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue(mockRegistrations),
      },
    };
    (globalThis as { navigator?: Navigator }).navigator = mockNavigator as unknown as Navigator;

    const ports = createBrowserPorts();
    await ports.purgeCachesAndWorkers();

    expect(mockCaches.keys).toHaveBeenCalledTimes(1);
    expect(mockCaches.delete).toHaveBeenCalledTimes(2);
    expect(mockCaches.delete).toHaveBeenCalledWith('cache-v1');
    expect(mockCaches.delete).toHaveBeenCalledWith('cache-v2');
    expect(mockNavigator.serviceWorker.getRegistrations).toHaveBeenCalledTimes(1);
    expect(mockRegistrations[0].unregister).toHaveBeenCalledTimes(1);
    expect(mockRegistrations[1].unregister).toHaveBeenCalledTimes(1);
  });

  it('purgeCachesAndWorkers: caches API missing → no throw', async () => {
    // No caches on globalThis
    (globalThis as { caches?: CacheStorage }).caches = undefined;
    const mockNavigator = { serviceWorker: undefined };
    (globalThis as { navigator?: Navigator }).navigator = mockNavigator as unknown as Navigator;

    const ports = createBrowserPorts();
    await expect(ports.purgeCachesAndWorkers()).resolves.toBeUndefined();
  });

  it('purgeCachesAndWorkers: serviceWorker missing → no throw', async () => {
    const mockCaches = {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    };
    (globalThis as { caches?: CacheStorage }).caches = mockCaches as unknown as CacheStorage;
    const mockNavigator = { serviceWorker: undefined };
    (globalThis as { navigator?: Navigator }).navigator = mockNavigator as unknown as Navigator;

    const ports = createBrowserPorts();
    await expect(ports.purgeCachesAndWorkers()).resolves.toBeUndefined();
  });

  it('reload calls window.location.reload()', () => {
    const mockReload = vi.fn();
    const mockWindow = { location: { reload: mockReload } };
    (globalThis as { window?: Window & typeof globalThis }).window = mockWindow as unknown as Window & typeof globalThis;

    const ports = createBrowserPorts();
    ports.reload();
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('reload: window missing → no throw', () => {
    (globalThis as { window?: Window & typeof globalThis }).window = undefined;
    const ports = createBrowserPorts();
    expect(() => ports.reload()).not.toThrow();
  });

  it('storage errors (private mode) are caught and return null/void', () => {
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('private mode');
      }),
      setItem: vi.fn(() => {
        throw new Error('private mode');
      }),
      removeItem: vi.fn(() => {
        throw new Error('private mode');
      }),
    };
    (globalThis as { localStorage?: Storage }).localStorage = throwingStorage as unknown as Storage;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = throwingStorage as unknown as Storage;

    const ports = createBrowserPorts();
    expect(ports.getStoredBuildId()).toBeNull();
    expect(() => ports.storeBuildId('x')).not.toThrow();
    expect(ports.hasReloadGuard()).toBe(false);
    expect(() => ports.armReloadGuard()).not.toThrow();
    expect(() => ports.clearReloadGuard()).not.toThrow();
  });
});

describe('Storage key isolation — doschei.auth.token and doschei.lang never touched', () => {
  it('createBrowserPorts only accesses STORED_BUILD_KEY and RELOAD_GUARD_KEY', () => {
    const localStorageCalls: string[] = [];
    const sessionStorageCalls: string[] = [];

    const localStorage = {
      getItem: vi.fn((k: string) => {
        localStorageCalls.push(k);
        return null;
      }),
      setItem: vi.fn((k: string) => {
        localStorageCalls.push(k);
      }),
      removeItem: vi.fn((k: string) => {
        localStorageCalls.push(k);
      }),
    };
    const sessionStorage = {
      getItem: vi.fn((k: string) => {
        sessionStorageCalls.push(k);
        return null;
      }),
      setItem: vi.fn((k: string) => {
        sessionStorageCalls.push(k);
      }),
      removeItem: vi.fn((k: string) => {
        sessionStorageCalls.push(k);
      }),
    };
    (globalThis as { localStorage?: Storage }).localStorage = localStorage as unknown as Storage;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = sessionStorage as unknown as Storage;

    const ports = createBrowserPorts();

    // Exercise all storage methods
    ports.getStoredBuildId();
    ports.storeBuildId('test-id');
    ports.hasReloadGuard();
    ports.armReloadGuard();
    ports.clearReloadGuard();

    // Verify only our keys were used
    expect(localStorageCalls).toEqual([
      STORED_BUILD_KEY, // getStoredBuildId
      STORED_BUILD_KEY, // storeBuildId
    ]);
    expect(sessionStorageCalls).toEqual([
      RELOAD_GUARD_KEY, // hasReloadGuard
      RELOAD_GUARD_KEY, // armReloadGuard
      RELOAD_GUARD_KEY, // clearReloadGuard
    ]);

    // Explicitly assert forbidden keys never appear
    const forbiddenKeys = ['doschei.auth.token', 'doschei.lang'];
    for (const key of forbiddenKeys) {
      expect(localStorageCalls).not.toContain(key);
      expect(sessionStorageCalls).not.toContain(key);
    }
  });

  it('checkForNewBuild with browser ports never touches forbidden keys', async () => {
    const localStorageCalls: string[] = [];
    const sessionStorageCalls: string[] = [];

    const localStorage = {
      getItem: vi.fn((k: string) => {
        localStorageCalls.push(k);
        return 'old-build';
      }),
      setItem: vi.fn((k: string) => {
        localStorageCalls.push(k);
      }),
      removeItem: vi.fn((k: string) => {
        localStorageCalls.push(k);
      }),
    };
    const sessionStorage = {
      getItem: vi.fn((k: string) => {
        sessionStorageCalls.push(k);
        return null;
      }),
      setItem: vi.fn((k: string) => {
        sessionStorageCalls.push(k);
      }),
      removeItem: vi.fn((k: string) => {
        sessionStorageCalls.push(k);
      }),
    };
    (globalThis as { localStorage?: Storage }).localStorage = localStorage as unknown as Storage;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = sessionStorage as unknown as Storage;

    // Mock fetch, caches, SW, window
    (globalThis as { fetch?: typeof fetch }).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ buildId: 'new-build' }),
    });
    (globalThis as { caches?: CacheStorage }).caches = {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    } as unknown as CacheStorage;
    (globalThis as { navigator?: Navigator }).navigator = {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([]) },
    } as unknown as Navigator;
    (globalThis as { window?: Window & typeof globalThis }).window = {
      location: { reload: vi.fn() },
    } as unknown as Window & typeof globalThis;

    const ports = createBrowserPorts();
    await checkForNewBuild(ports);

    // Only our keys
    expect(localStorageCalls).toEqual([STORED_BUILD_KEY, STORED_BUILD_KEY]);
    expect(sessionStorageCalls).toEqual([RELOAD_GUARD_KEY, RELOAD_GUARD_KEY]);

    const forbiddenKeys = ['doschei.auth.token', 'doschei.lang'];
    for (const key of forbiddenKeys) {
      expect(localStorageCalls).not.toContain(key);
      expect(sessionStorageCalls).not.toContain(key);
    }
  });
});

describe('Constants exported correctly', () => {
  it('STORED_BUILD_KEY has correct value', () => {
    expect(STORED_BUILD_KEY).toBe('doschei.app.buildId');
  });

  it('RELOAD_GUARD_KEY has correct value', () => {
    expect(RELOAD_GUARD_KEY).toBe('doschei.app.reloadGuard');
  });

  it('MIN_CHECK_INTERVAL_MS is 30_000', () => {
    expect(MIN_CHECK_INTERVAL_MS).toBe(30_000);
  });

  it('VersionAction type includes all four variants', () => {
    const actions: VersionAction[] = [
      'store',
      'purge-and-reload',
      'skip-healed',
      'skip',
    ];
    expect(actions).toHaveLength(4);
  });
});
