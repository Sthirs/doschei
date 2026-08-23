/**
 * Unit tests for the strict `parseLanguage` helper exported from
 * `apps/backend/src/services/authService.ts`.
 *
 * `parseLanguage` is the validator used by the PATCH /api/auth/me path,
 * which takes an EXPLICIT user choice. Unlike
 * `normalizeRequestedLanguage` (permissive — used for device-derived
 * inputs and graceful-degrades to 'en'), `parseLanguage` returns
 * `SupportedLanguage | null` — `null` means the controller must reject
 * the request with 400. The contrast is what Task 7's "PATCH invalid
 * language → 400" integration assertion is exercising.
 *
 * Adversarial-QA vector for `malformed_input`:
 *   - non-string input (number, object, array, boolean) → null
 *   - undefined / null → null
 *   - empty / whitespace-only string → null
 *   - unsupported primary subtag (`'fr'`, `'xx'`, `'en-Latn'`) → null
 *   - tag with region suffix → stripped before matching (`'it-IT'` → 'it')
 *   - leading / trailing whitespace tolerated (`'  it  '` → 'it')
 *   - mixed-case input → lowercased before matching (`'IT'` → 'it')
 */
import { describe, expect, it } from 'vitest';

import { parseLanguage } from '../../src/services/authService';

describe('parseLanguage', () => {
  describe('happy-path supported locales', () => {
    it.each([
      ['it', 'it'],
      ['en', 'en'],
      ['IT', 'it'],
      ['EN', 'en'],
      ['It', 'it'],
    ])('accepts the bare tag %j', (input, expected) => {
      expect(parseLanguage(input)).toBe(expected);
    });

    it.each([
      ['it-IT', 'it'],
      ['it-CH', 'it'],
      ['en-US', 'en'],
      ['en-GB', 'en'],
      ['IT-it', 'it'],
      ['En-Us', 'en'],
    ])('strips the region suffix for %j', (input, expected) => {
      expect(parseLanguage(input)).toBe(expected);
    });

    it('tolerates leading and trailing whitespace', () => {
      expect(parseLanguage('  it  ')).toBe('it');
      expect(parseLanguage(' en-US ')).toBe('en');
    });
  });

  describe('rejects unknown / unsupported tags', () => {
    it.each([
      'fr',
      'de',
      'es',
      'xx',
      'i',
      'italiano',
    ])('returns null for unsupported tag %j', (input) => {
      expect(parseLanguage(input)).toBeNull();
    });

    it.each([
      ['en-Latn', 'en'],
      ['it-Latn', 'it'],
      ['en-US-x-private', 'en'],
      ['IT-it-x', 'it'],
    ])('strips beyond the primary subtag: %j → %j', (input, expected) => {
      expect(parseLanguage(input)).toBe(expected);
    });

    it('returns null for an empty string', () => {
      expect(parseLanguage('')).toBeNull();
    });

    it('returns null for a whitespace-only string', () => {
      expect(parseLanguage('   ')).toBeNull();
      expect(parseLanguage('\t\n')).toBeNull();
    });
  });

  describe('rejects non-string input', () => {
    it.each([
      [undefined, 'undefined'],
      [null, 'null'],
      [123, 'number'],
      [{}, 'object'],
      [[], 'empty array'],
      [['en'], 'array'],
      [true, 'boolean'],
    ])('returns null for non-string input (%s)', (input) => {
      expect(parseLanguage(input as unknown)).toBeNull();
    });
  });
});
