import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { en } from '@/i18n/en';
import { it as itMessages } from '@/i18n/it';
import {
  SUPPORTED_LOCALES,
  type Locale,
  normalizeLocale,
  resolveInitialLocale,
  setAppLocale,
} from '@/i18n';

const STORAGE_KEY = 'doschei.lang';

/**
 * Collect the dot-separated leaf keys of a nested message object.
 * Leaf detection: primitive value (not a plain object, not an array).
 */
function deepKeys(
  value: unknown,
  prefix = '',
): readonly string[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return prefix === '' ? [] : [prefix];
  }

  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix === '' ? k : `${prefix}.${k}`;
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
    const mutated = structuredClone(itMessages);
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

  it("resolution is isolated per test (no leakage from previous case)", () => {
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
