import { describe, expect, it } from 'vitest';

import {
  csvEscapeField,
  formatMemberNet,
  rfc5987Filename,
  sanitizeLatin1Filename,
} from '../src/services/csvExport';

describe('csvEscapeField', () => {
  it('leaves a plain field unchanged', () => {
    expect(csvEscapeField('hello')).toBe('hello');
  });

  it('wraps a field containing a comma', () => {
    expect(csvEscapeField('Smith, John')).toBe('"Smith, John"');
  });

  it('wraps and doubles inner double quotes', () => {
    expect(csvEscapeField('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps a field containing a newline', () => {
    expect(csvEscapeField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps a field containing a carriage return', () => {
    expect(csvEscapeField('line1\rline2')).toBe('"line1\rline2"');
  });

  it('returns an empty string as-is', () => {
    expect(csvEscapeField('')).toBe('');
  });

  it('does not wrap a field that only contains spaces', () => {
    expect(csvEscapeField('  ')).toBe('  ');
  });
});

describe('sanitizeLatin1Filename', () => {
  it('replaces whitespace runs with dashes', () => {
    expect(sanitizeLatin1Filename('My Group Name')).toBe('My-Group-Name');
  });

  it('strips accented characters not in the Latin-1 safe set', () => {
    // é is stripped entirely — no placeholder dash remains.
    expect(sanitizeLatin1Filename('Café')).toBe('Caf');
  });

  it('strips punctuation and keeps the words', () => {
    expect(sanitizeLatin1Filename('!!!Fun!!!')).toBe('Fun');
  });

  it('collapses repeated dashes', () => {
    expect(sanitizeLatin1Filename('a--b---c')).toBe('a-b-c');
  });

  it('falls back to "export" for an empty or whitespace-only name', () => {
    expect(sanitizeLatin1Filename('')).toBe('export');
    expect(sanitizeLatin1Filename('   ')).toBe('export');
  });
});

describe('rfc5987Filename', () => {
  it('leaves an ASCII-safe name unchanged', () => {
    expect(rfc5987Filename('hello')).toBe('hello');
  });

  it('percent-encodes UTF-8 bytes of non-ASCII characters', () => {
    // é is U+00E9 → UTF-8 bytes 0xC3 0xA9
    expect(rfc5987Filename('Café')).toBe('Caf%C3%A9');
  });

  it('percent-encodes spaces', () => {
    expect(rfc5987Filename('hello world')).toBe('hello%20world');
  });

  it('percent-encodes a forward slash', () => {
    expect(rfc5987Filename('/')).toBe('%2F');
  });
});

describe('formatMemberNet', () => {
  it('returns the full amount (positive) when the member paid and has no splits', () => {
    expect(formatMemberNet('alice', 'alice', 100, [])).toBe('100.00');
  });

  it('returns 0.00 when the member neither paid nor is owed', () => {
    expect(formatMemberNet('alice', 'bob', 100, [])).toBe('0.00');
  });

  it('nets to zero when a member paid themselves back exactly (payer = sole splitter)', () => {
    expect(
      formatMemberNet('alice', 'alice', 100, [{ userId: 'alice', computedAmount: 100 }]),
    ).toBe('0.00');
  });

  it('returns a negative net for a non-payer member who owes part of the expense', () => {
    expect(
      formatMemberNet('alice', 'bob', 100, [{ userId: 'bob', computedAmount: 25 }]),
    ).toBe('-25.00');
  });

  it('sums multiple splits on the same member and subtracts from paid', () => {
    expect(
      formatMemberNet(
        'alice',
        'alice',
        100,
        [
          { userId: 'alice', computedAmount: 40 },
          { userId: 'alice', computedAmount: 20 },
        ],
      ),
    ).toBe('40.00');
  });

  it('matches the settlement shape: payer (creditor) nets +amount, payee nets −amount', () => {
    expect(
      formatMemberNet('alice', 'alice', 30, [{ userId: 'bob', computedAmount: 30 }]),
    ).toBe('30.00');
    expect(
      formatMemberNet('alice', 'bob', 30, [{ userId: 'bob', computedAmount: 30 }]),
    ).toBe('-30.00');
  });

  it('ignores splits belonging to other members', () => {
    const splits = [
      { userId: 'alice', computedAmount: 50 },
      { userId: 'carol', computedAmount: 50 },
    ];
    expect(formatMemberNet('alice', 'alice', 100, splits)).toBe('50.00');
    expect(formatMemberNet('alice', 'carol', 100, splits)).toBe('-50.00');
    expect(formatMemberNet('alice', 'bob', 100, splits)).toBe('0.00');
  });

  it('rounds at the cents boundary: paid 100, owed 33.33 → net 66.67', () => {
    expect(
      formatMemberNet('alice', 'alice', 100, [{ userId: 'alice', computedAmount: 33.33 }]),
    ).toBe('66.67');
  });
});
