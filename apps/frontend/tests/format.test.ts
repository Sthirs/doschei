import { describe, it, expect } from 'vitest';

import {
  formatEur,
  balanceChipKind,
  balanceColorClass,
  groupInitials,
} from '@/lib/format';

describe('formatEur', () => {
  it('formats a positive amount with EUR symbol (en locale default)', () => {
    expect(formatEur(42.5)).toBe('€42.50');
    expect(formatEur(42.5, 'en')).toBe('€42.50');
  });

  it('formats zero', () => {
    expect(formatEur(0)).toBe('€0.00');
    expect(formatEur(0, 'en')).toBe('€0.00');
  });

  it('formats a negative amount with a leading minus (en locale)', () => {
    expect(formatEur(-15)).toBe('-€15.00');
    expect(formatEur(-15, 'en')).toBe('-€15.00');
  });

  it('never emits a dollar sign', () => {
    expect(formatEur(42.5)).not.toContain('$');
    expect(formatEur(42.5, 'it')).not.toContain('$');
  });

  it('it locale uses comma as decimal separator and symbol after the number', () => {
    // Whitespace between digits and symbol differs across runtimes (regular
    // space vs U+00A0), so match on substance rather than exact spacing.
    expect(formatEur(42.5, 'it')).toMatch(/42,50\s?€/);
    expect(formatEur(42.5, 'it')).not.toContain('.');
  });
});

describe('balanceChipKind', () => {
  it('returns owed for a positive net', () => {
    expect(balanceChipKind(10)).toBe('owed');
  });

  it('returns owe for a negative net', () => {
    expect(balanceChipKind(-3)).toBe('owe');
  });

  it('returns settled for a zero net', () => {
    expect(balanceChipKind(0)).toBe('settled');
  });
});

describe('balanceColorClass', () => {
  it('returns a non-empty class for each kind', () => {
    expect(balanceColorClass('owed')).toBeTruthy();
    expect(balanceColorClass('owe')).toBeTruthy();
    expect(balanceColorClass('settled')).toBeTruthy();
  });
});

describe('groupInitials', () => {
  it('takes first letters of first two words', () => {
    expect(groupInitials('Weekend in Venice')).toBe('WV');
    expect(groupInitials('Office Lunch')).toBe('OL');
    expect(groupInitials('Holiday in Palermo')).toBe('HP');
    expect(groupInitials('Personal Spending')).toBe('PS');
  });

  it('returns empty string for empty input', () => {
    expect(groupInitials('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(groupInitials('   ')).toBe('');
  });

  it('skips Italian stopwords', () => {
    expect(groupInitials('Viaggio a Roma')).toBe('VR');
    expect(groupInitials('Cena con gli amici')).toBe('CA');
    expect(groupInitials('Spesa di ieri')).toBe('SI');
  });
});
