import { describe, expect, it } from 'vitest';

import { isValidEmail } from '../src/utils/emailValidation';

describe('isValidEmail', () => {
  describe('accepts valid addresses', () => {
    it.each([
      ['plain address', 'user@example.com'],
      ['dot in local part', 'first.last@example.com'],
      ['subdomain', 'user@sub.example.com'],
      ['multi-level TLD', 'user@example.co.uk'],
      ['single-char labels', 'a@b.co'],
      ['whitespace-padded input is trimmed', '  padded@example.com  '],
      ['numeric domain', 'user@123.com'],
    ])('accepts %s', (_label, input) => {
      expect(isValidEmail(input)).toBe(true);
    });
  });

  describe('rejects invalid input', () => {
    it.each([
      ['non-string', 123],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['missing @', 'userexample.com'],
      ['missing domain dot', 'user@example'],
      ['domain starts with dot', 'user@.example.com'],
      ['domain ends with dot', 'user@example.com.'],
      ['consecutive dots in domain', 'user@example..com'],
      ['spaces inside address', 'user @example.com'],
      ['two @ signs', 'user@name@example.com'],
    ])('rejects %s', (_label, input) => {
      expect(isValidEmail(input)).toBe(false);
    });
  });

  it('rejects an email longer than 254 characters', () => {
    const tooLong = `${'a'.repeat(251)}@b.co`; // 256 chars
    expect(tooLong.length).toBe(256);
    expect(isValidEmail(tooLong)).toBe(false);
  });

  it('accepts an email of exactly 254 characters', () => {
    const exact = `${'a'.repeat(249)}@b.co`; // 254 chars
    expect(exact.length).toBe(254);
    expect(isValidEmail(exact)).toBe(true);
  });

  describe('ReDoS regression', () => {
    // GitHub code scanning flagged the original `[^\s@]+\.[^\s@]+` pattern as
    // polynomial on inputs starting with `!@!.` followed by many `!.` repetitions:
    // `.` belonged to both `[^\s@]+` and the literal `\.`, so the engine tried
    // every dot position. The replacement excludes `.` from the domain-label
    // class, making the split unambiguous. This adversarial input must be
    // rejected quickly, not hang.
    it('rejects the adversarial !@!. + (!.)* input without hanging', () => {
      const adversarial = `!@!.${'!.'.repeat(5000)}`;
      const start = Date.now();
      const result = isValidEmail(adversarial);
      const elapsed = Date.now() - start;

      expect(result).toBe(false);
      // Safe regex runs in <1ms on 10k chars; 250ms gives generous headroom for
      // slow CI runners while still catching a revert to a vulnerable pattern
      // (which would take seconds to minutes on 5000 repetitions).
      expect(elapsed).toBeLessThan(250);
    });
  });
});
