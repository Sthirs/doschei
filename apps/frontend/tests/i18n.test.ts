import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { en } from '@/i18n/en';
import { it as itMessages } from '@/i18n/it';
import {
  i18n,
  SUPPORTED_LOCALES,
  type Locale,
  normalizeLocale,
  resolveInitialLocale,
  setAppLocale,
} from '@/i18n';

const STORAGE_KEY = 'doschei.lang';

// Mock the api module so the auth store's network calls resolve
// deterministically in the ADR-0018 tier-1 (authenticated user.language)
// section below — this file is otherwise real/unmocked `@/i18n` behavior.
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

/**
 * Collect the dot-separated leaf keys of a nested message object.
 * Leaf detection: primitive value, function, or array (not a plain object).
 */
function deepKeys(value: unknown, prefix = ''): readonly string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix === '' ? [] : [prefix];
  }

  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix === '' ? k : `${prefix}.${k}`;
    if (typeof v === 'function') {
      out.push(next);
      continue;
    }
    out.push(...deepKeys(v, next));
  }
  return out;
}

describe('i18n/locale types', () => {
  it('SUPPORTED_LOCALES exposes exactly en and it', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'it']);
  });

  it('Locale is the union of SUPPORTED_LOCALES values', () => {
    // Compile-time + runtime check.
    const locales: readonly Locale[] = ['en', 'it'];
    expect(locales).toEqual([...SUPPORTED_LOCALES]);
  });
});

describe('i18n/normalizeLocale', () => {
  it("returns 'it' for plain 'it'", () => {
    expect(normalizeLocale('it')).toBe('it');
  });

  it("returns 'it' for 'it-IT' region form", () => {
    expect(normalizeLocale('it-IT')).toBe('it');
  });

  it("returns 'it' for 'IT' upper-case", () => {
    expect(normalizeLocale('IT')).toBe('it');
  });

  it("returns 'en' for 'en'", () => {
    expect(normalizeLocale('en')).toBe('en');
  });

  it("returns 'en' for an unsupported BCP-47 prefix like 'fr'", () => {
    expect(normalizeLocale('fr-FR')).toBe('en');
  });

  it('returns en when input is non-string (null/undefined/number)', () => {
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale(42)).toBe('en');
    expect(normalizeLocale({})).toBe('en');
  });

  it('returns en when input is empty string', () => {
    expect(normalizeLocale('')).toBe('en');
  });
});

describe('i18n/key parity', () => {
  it('it has the same deep key set as en', () => {
    const enKeys = [...deepKeys(en)].sort();
    const itKeys = [...deepKeys(itMessages)].sort();
    expect(itKeys).toEqual(enKeys);
  });

  it('missing a key in it would break parity', () => {
    // Self-check: deleting one key MUST make this fail.
    // JSON deep-clone drops function values, but `deepKeys` records their keys
    // by name — parity only checks presence, not callable identity.
    const mutated = JSON.parse(JSON.stringify(itMessages)) as Record<
      string,
      unknown
    >;
    // @ts-expect-error: deliberate runtime mutation for the assertion
    delete mutated.common.save;
    expect([...deepKeys(mutated)].sort()).not.toEqual([...deepKeys(en)].sort());
  });
});

describe('i18n/resolveInitialLocale (D2 order)', () => {
  type Stub = {
    lang: string | undefined;
    storage: Record<string, string>;
  };

  const realNavigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const realLocalStorage = (globalThis as { localStorage?: Storage })
    .localStorage;

  function installStubs({ lang, storage }: Stub): void {
    if (lang === undefined) {
      Object.defineProperty(globalThis, 'navigator', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        value: { language: lang },
        configurable: true,
        writable: true,
      });
    }

    const fakeStorage: Storage = {
      length: Object.keys(storage).length,
      clear: () => {
        for (const k of Object.keys(storage)) delete storage[k];
      },
      getItem: (k: string) =>
        Object.prototype.hasOwnProperty.call(storage, k) ? storage[k]! : null,
      key: (i: number) => Object.keys(storage)[i] ?? null,
      removeItem: (k: string) => {
        delete storage[k];
      },
      setItem: (k: string, v: string) => {
        storage[k] = String(v);
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeStorage,
      configurable: true,
      writable: true,
    });

    // happy-dom provides `document` already; ensure <html> is fresh.
    document.documentElement.lang = '';
  }

  function restoreStubs(): void {
    if (realNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', realNavigatorDescriptor);
    }
    if (realLocalStorage !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: realLocalStorage,
        configurable: true,
        writable: true,
      });
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
  }

  afterEach(() => {
    restoreStubs();
  });

  it("localStorage set to 'it' wins over navigator='en-US'", () => {
    installStubs({ lang: 'en-US', storage: { [STORAGE_KEY]: 'it' } });
    expect(resolveInitialLocale()).toBe('it');
  });

  it("localStorage set to 'en' wins over navigator='it-IT'", () => {
    installStubs({ lang: 'it-IT', storage: { [STORAGE_KEY]: 'en' } });
    expect(resolveInitialLocale()).toBe('en');
  });

  it("no localStorage, navigator.language='it-IT' resolves to 'it'", () => {
    installStubs({ lang: 'it-IT', storage: {} });
    expect(resolveInitialLocale()).toBe('it');
  });

  it("no localStorage, navigator.language='fr' falls back to 'en'", () => {
    installStubs({ lang: 'fr', storage: {} });
    expect(resolveInitialLocale()).toBe('en');
  });

  it("both absent falls back to 'en'", () => {
    installStubs({ lang: undefined, storage: {} });
    expect(resolveInitialLocale()).toBe('en');
  });

  it('resolution is isolated per test (no leakage from previous case)', () => {
    // First case wrote 'it' to localStorage in a prior test.
    // After fresh install with empty storage, we must NOT see 'it'.
    installStubs({ lang: 'en-US', storage: {} });
    expect(resolveInitialLocale()).toBe('en');
  });
});

describe('i18n/setAppLocale', () => {
  const STORAGE_KEY_FOR_TEST = STORAGE_KEY;
  const realLocalStorage = (globalThis as { localStorage?: Storage })
    .localStorage;

  function readStorage(key: string): string | null {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ? ls.getItem(key) : null;
  }

  function freshStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k) => (map.has(k) ? map.get(k)! : null),
      key: (i) => Array.from(map.keys())[i] ?? null,
      removeItem: (k) => {
        map.delete(k);
      },
      setItem: (k, v) => {
        map.set(k, String(v));
      },
    };
  }

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: freshStorage(),
      configurable: true,
      writable: true,
    });
    document.documentElement.lang = '';
  });

  afterEach(() => {
    if (realLocalStorage !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: realLocalStorage,
        configurable: true,
        writable: true,
      });
    }
  });

  it("setAppLocale('it') updates html lang and localStorage", () => {
    setAppLocale('it');
    expect(document.documentElement.lang).toBe('it');
    expect(readStorage(STORAGE_KEY_FOR_TEST)).toBe('it');
  });

  it("setAppLocale('en') updates html lang and localStorage", () => {
    setAppLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(readStorage(STORAGE_KEY_FOR_TEST)).toBe('en');
  });
});

describe('i18n/resolution order — all four ADR-0018 tiers', () => {
  // ADR-0018: authenticated `user.language` -> `localStorage['doschei.lang']`
  // -> browser language prefix -> 'en'. Tiers 2-4 are exercised by
  // `resolveInitialLocale` directly (see above); tier 1 only takes effect
  // once a user authenticates, applied via the auth store's
  // `applyUserLanguage` -> `setAppLocale`. This block pins the full chain,
  // including tier 1 overriding the other three, using the real (unmocked)
  // `@/i18n` module so a catalog edit cannot cause a spurious failure —
  // assertions are on the resolved `Locale` code, never on translated text.
  const realNavigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const realLocalStorage = (globalThis as { localStorage?: Storage })
    .localStorage;

  function installEnv(
    lang: string | undefined,
    storage: Record<string, string>,
  ): void {
    Object.defineProperty(globalThis, 'navigator', {
      value: lang === undefined ? undefined : { language: lang },
      configurable: true,
      writable: true,
    });
    const map = new Map<string, string>(Object.entries(storage));
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        get length() {
          return map.size;
        },
        clear: () => map.clear(),
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        removeItem: (k: string) => {
          map.delete(k);
        },
        setItem: (k: string, v: string) => {
          map.set(k, String(v));
        },
      },
      configurable: true,
      writable: true,
    });
    document.documentElement.lang = '';
  }

  function restoreEnv(): void {
    if (realNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', realNavigatorDescriptor);
    }
    Object.defineProperty(globalThis, 'localStorage', {
      value: realLocalStorage,
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    setAppLocale('en');
  });

  it('tier 4: no storage, no navigator language -> default en', () => {
    installEnv(undefined, {});
    expect(resolveInitialLocale()).toBe('en');
  });

  it('tier 3: browser language prefix wins over the tier-4 default', () => {
    installEnv('it-IT', {});
    expect(resolveInitialLocale()).toBe('it');
  });

  it("tier 2: localStorage['doschei.lang'] wins over the tier-3 browser prefix", () => {
    installEnv('en-US', { [STORAGE_KEY]: 'it' });
    expect(resolveInitialLocale()).toBe('it');
  });

  it('tier 1: authenticated user.language wins over tiers 2-4 combined', async () => {
    // Boot-time resolution (tiers 2-4) would land on 'en' here: no stored
    // locale, and the browser reports 'en-US'.
    installEnv('en-US', {});
    expect(resolveInitialLocale()).toBe('en');
    setAppLocale('en');
    expect(i18n.global.locale.value).toBe('en');

    // Import the (unmocked) auth store fresh so it reads the environment
    // installed above, then simulate a successful login for a user whose
    // saved server-side preference is 'it' — this is tier 1 and must beat
    // the tier 2-4 result already applied at boot.
    const { useAuthStore } = await import('@/stores/auth');
    const authStore = useAuthStore();
    mockApiPost.mockResolvedValueOnce({
      data: {
        token: 'test-token',
        user: {
          id: 'user-1',
          email: 'alice@test.com',
          displayName: 'Alice',
          language: 'it',
          imageUrl: null,
        },
      },
    });

    await authStore.login({ email: 'alice@test.com', password: 'pw' });

    expect(i18n.global.locale.value).toBe('it');
    expect(readStorageDirect(STORAGE_KEY)).toBe('it');
    expect(document.documentElement.lang).toBe('it');
  });

  function readStorageDirect(key: string): string | null {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ? ls.getItem(key) : null;
  }
});
