export const STORED_BUILD_KEY = 'doschei.app.buildId';
export const RELOAD_GUARD_KEY = 'doschei.app.reloadGuard';
export const MIN_CHECK_INTERVAL_MS = 30_000;

export type VersionAction =
  | 'store'
  | 'purge-and-reload'
  | 'skip-healed'
  | 'skip';

/**
 * Pure decision function — no side effects, no I/O.
 * Returns the action to take based on stored vs remote build IDs.
 */
export function decideVersionAction(
  stored: string | null,
  remote: string | null,
): VersionAction {
  if (remote === null) return 'skip';
  if (stored === remote) return 'store';
  return 'purge-and-reload';
}

export interface AppVersionPorts {
  fetchRemoteBuildId(): Promise<string | null>;
  getStoredBuildId(): string | null;
  storeBuildId(id: string): void;
  hasReloadGuard(): boolean;
  armReloadGuard(): void;
  clearReloadGuard(): void;
  purgeCachesAndWorkers(): Promise<void>;
  reload(): void;
}

/**
 * Orchestrates the version check with injected ports.
 * All errors are swallowed → silent 'skip' (offline/deploy-window safety).
 */
export async function checkForNewBuild(
  ports: AppVersionPorts,
): Promise<VersionAction> {
  try {
    const remote = await ports.fetchRemoteBuildId();
    if (remote === null) return 'skip';

    const stored = ports.getStoredBuildId();

    if (stored === remote) {
      ports.clearReloadGuard();
      return 'store';
    }

    // Mismatch: stored !== remote
    if (ports.hasReloadGuard()) {
      // Guard already armed → this is a retry loop, heal without reload
      ports.storeBuildId(remote);
      return 'skip-healed';
    }

    // First mismatch → purge, store, arm guard, reload
    await ports.purgeCachesAndWorkers();
    ports.storeBuildId(remote);
    ports.armReloadGuard();
    ports.reload();
    return 'purge-and-reload';
  } catch {
    // Any failure (network, storage, caches, SW) → silent no-op
    return 'skip';
  }
}

/**
 * Throttle helper — exported for tests.
 * Returns false when the time since last check is less than MIN_CHECK_INTERVAL_MS.
 */
export function shouldRunCheck(
  nowMs: number,
  lastMs: number | undefined,
): boolean {
  if (lastMs === undefined) return true;
  return nowMs - lastMs >= MIN_CHECK_INTERVAL_MS;
}

/**
 * Browser implementation of AppVersionPorts using globals defensively.
 * Guards every global access so happy-dom / old browsers never throw.
 */
export function createBrowserPorts(): AppVersionPorts {
  return {
    async fetchRemoteBuildId(): Promise<string | null> {
      try {
        const res = await fetch('/app-version.json', { cache: 'no-store' });
        if (!res.ok) return null;
        const data = (await res.json()) as { buildId?: string };
        return data.buildId ?? null;
      } catch {
        return null;
      }
    },

    getStoredBuildId(): string | null {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
          return globalThis.localStorage.getItem(STORED_BUILD_KEY);
        }
      } catch {
        // Storage disabled / private mode
      }
      return null;
    },

    storeBuildId(id: string): void {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
          globalThis.localStorage.setItem(STORED_BUILD_KEY, id);
        }
      } catch {
        // Storage disabled / private mode / quota exceeded
      }
    },

    hasReloadGuard(): boolean {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) {
          return globalThis.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1';
        }
      } catch {
        // Storage disabled
      }
      return false;
    },

    armReloadGuard(): void {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) {
          globalThis.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
        }
      } catch {
        // Storage disabled
      }
    },

    clearReloadGuard(): void {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) {
          globalThis.sessionStorage.removeItem(RELOAD_GUARD_KEY);
        }
      } catch {
        // Storage disabled
      }
    },

    async purgeCachesAndWorkers(): Promise<void> {
      // Delete all Cache API entries
      try {
        if (
          typeof globalThis !== 'undefined' &&
          'caches' in globalThis &&
          typeof (globalThis as { caches?: CacheStorage }).caches?.keys ===
            'function'
        ) {
          const cacheStorage = (globalThis as { caches: CacheStorage }).caches;
          const keys = await cacheStorage.keys();
          await Promise.all(keys.map((k) => cacheStorage.delete(k)));
        }
      } catch {
        // Cache API unavailable or deletion failed
      }

      // Unregister all service workers
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.serviceWorker &&
          typeof navigator.serviceWorker.getRegistrations === 'function'
        ) {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((reg) => reg.unregister()),
          );
        }
      } catch {
        // Service Worker API unavailable or unregister failed
      }
    },

    reload(): void {
      try {
        if (typeof window !== 'undefined' && window.location) {
          window.location.reload();
        }
      } catch {
        // location.reload unavailable
      }
    },
  };
}
