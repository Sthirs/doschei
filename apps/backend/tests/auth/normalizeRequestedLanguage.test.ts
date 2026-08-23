/**
 * Unit tests for the `normalizeRequestedLanguage` helper exported from
 * `apps/backend/src/services/authService.ts`.
 *
 * The helper is the SOLE source of truth for turning "whatever the client
 * sent" into one of the two supported locales (`'en' | 'it'`). The
 * controller and the OAuth service both depend on it; this file pins the
 * contract exhaustively so a refactor (e.g., adding a new locale,
 * changing the prefix-stripping rule, or accidentally throwing on
 * non-string input) trips the suite immediately.
 *
 * Adversarial-QA vector for `malformed_input`:
 *   - null, number, empty object → 'en' (no throw)
 *   - empty string, whitespace-only → 'en'
 *   - BCP-47 with region suffix (`it-IT`, `en-US`) → strip region
 *   - Accept-Language header style (`"it;q=0.9,en"`) → take first segment
 *   - raw string[] array (e.g., the parsed Accept-Language header) → first
 *     element wins
 *   - mixed-case input → lowercased before prefix check
 */
import { describe, expect, it } from 'vitest';

import { normalizeRequestedLanguage } from '../../src/services/authService';

describe('normalizeRequestedLanguage', () => {
  describe('happy-path locales', () => {
    it.each([
      ['it', 'it'],
      ['en', 'en'],
      ['IT', 'it'],
      ['EN', 'en'],
      ['It', 'it'],
    ])('returns the requested locale for bare tag %j', (input, expected) => {
      expect(normalizeRequestedLanguage(input)).toBe(expected);
    });

    it.each([
      ['it-IT', 'it'],
      ['it-CH', 'it'],
      ['en-US', 'en'],
      ['en-GB', 'en'],
      ['IT-it', 'it'],
      ['En-Us', 'en'],
    ])('strips the region suffix for %j', (input, expected) => {
      expect(normalizeRequestedLanguage(input)).toBe(expected);
    });
  });

  describe('Accept-Language header parsing', () => {
    it('takes the first comma-separated segment', () => {
      expect(normalizeRequestedLanguage('it,it-IT;q=0.9,en;q=0.8')).toBe('it');
      expect(normalizeRequestedLanguage('en,it;q=0.9')).toBe('en');
    });

    it('handles q-value ordering tokens', () => {
      expect(normalizeRequestedLanguage('en;q=0.5,it;q=0.9')).toBe('en');
      expect(normalizeRequestedLanguage('it;q=0.9,en;q=0.5')).toBe('it');
    });

    it('accepts a raw string[] (e.g. parsed Accept-Language header)', () => {
      expect(normalizeRequestedLanguage(['it-IT', 'en-US'])).toBe('it');
      expect(normalizeRequestedLanguage(['en-US', 'it-IT'])).toBe('en');
    });
  });

  describe('graceful degradation for unknown / malformed input', () => {
    it.each([
      ['fr', 'en'],
      ['de', 'en'],
      ['es', 'en'],
      ['xx', 'en'],
      ['', 'en'],
      ['   ', 'en'],
    ])('falls back to en for unsupported tag %j', (input, expected) => {
      expect(normalizeRequestedLanguage(input)).toBe(expected);
    });

    it.each([
      [undefined, 'en'],
      [null, 'en'],
      [42, 'en'],
      [{}, 'en'],
      [true, 'en'],
    ])('returns en without throwing for non-string input %j', (input, expected) => {
      // The helper is intentionally permissive — anything that cannot
      // be parsed as a language tag must NOT crash the registration or
      // PATCH /me path.
      expect(normalizeRequestedLanguage(input as unknown)).toBe(expected);
    });
  });
});
