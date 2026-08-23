import { createI18n } from 'vue-i18n';

import { en } from './en';
import { it as itMessages } from './it';

/**
 * Storage key used by `setAppLocale`/`resolveInitialLocale` to persist the
 * preferred locale across reloads (anonymous/pre-login screens).
 *
 * Authenticated users always read their preference from the server-side
 * `user.language` (applied in `stores/auth.ts` after login / fetchCurrentUser
 * / loginWithToken — Task 8). The localStorage value is only consulted by
 * `resolveInitialLocale()` when the user has not yet authenticated.
 */
export const LOCALE_STORAGE_KEY = 'doschei.lang';

export const SUPPORTED_LOCALES = ['en', 'it'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Normalize a raw BCP-47-ish locale string to one of our `Locale`s.
 *
 * Rules (D2):
 *   - Non-string input (null/undefined/number/object) -> 'en'
 *   - Empty string -> 'en'
 *   - Lower-cased primary subtag 'it' (with or without region) -> 'it'
 *   - Anything else -> 'en'
 */
export function normalizeLocale(raw: unknown): Locale {
  if (typeof raw !== 'string') return 'en';
  const trimmed = raw.trim();
  if (trimmed === '') return 'en';
  const prefix = trimmed.toLowerCase().split('-')[0];
  if (prefix === 'it') return 'it';
  return 'en';
}

/**
 * Resolve the locale to use at boot.
 *
 * D2 anonymous/pre-login order:
 *   1. `localStorage[LOCALE_STORAGE_KEY]` (if a previous `setAppLocale` set it)
 *   2. `navigator.language` (primary subtag)
 *   3. 'en'
 *
 * Guarded for SSR / happy-dom where either `navigator` or `localStorage` may
 * be absent. Authenticated-user preference override is layered on top by the
 * auth store in Task 8.
 */
export function resolveInitialLocale(): Locale {
  let stored: string | null = null;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      stored = globalThis.localStorage.getItem(LOCALE_STORAGE_KEY);
    }
  } catch {
    stored = null;
  }

  if (stored !== null) {
    const fromStorage = normalizeLocale(stored);
    if (fromStorage === 'it') return 'it';
    if (stored === 'en') return 'en';
    // unknown stored value (e.g. legacy 'fr') -> fall through
  }

  let navLang: string | undefined;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.navigator) {
      navLang = globalThis.navigator.language;
    }
  } catch {
    navLang = undefined;
  }

  if (typeof navLang === 'string') {
    return normalizeLocale(navLang);
  }

  return 'en';
}

/**
 * Apply a locale everywhere that observes it:
 *   - vue-i18n global composer (drives `useI18n().t(...)`)
 *   - `localStorage[LOCALE_STORAGE_KEY]` so the next boot picks it up
 *   - `<html lang>` so assistive tech and CSS `[lang]` selectors see it
 *
 * Safe to call before `app.mount(...)` (the i18n instance is constructed with
 * `resolveInitialLocale()` at module load) and again after a user-driven
 * locale change (Task 8 AccountView).
 */
export function setAppLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // Storage may be disabled (private mode, embedded contexts); non-fatal.
  }
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = locale;
    }
  } catch {
    // No DOM (SSR/Node); non-fatal.
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    it: itMessages,
  },
});
