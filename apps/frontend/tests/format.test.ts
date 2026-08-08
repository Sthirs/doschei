import { describe, it, expect } from 'vitest';

import {
  formatEur,
  balanceChipKind,
  balanceColorClass,
  groupInitials,
  balanceChipLabel,
} from '@/lib/format';

describe('formatEur', () => {
  it('formats a positive amount with EUR symbol', () => {
    expect(formatEur(42.5)).toBe('€42.50');
  });

  it('formats zero', () => {
    expect(formatEur(0)).toBe('€0.00');
  });

  it('formats a negative amount with a leading minus', () => {
    expect(formatEur(-15)).toBe('-€15.00');
  });

  it('never emits a dollar sign', () => {
    expect(formatEur(42.5)).not.toContain('$');
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
});

describe('balanceChipLabel', () => {
  it('labels a positive net as being owed', () => {
    expect(balanceChipLabel(10)).toBe('You are owed €10.00');
  });

  it('labels a negative net as owing', () => {
    expect(balanceChipLabel(-12.5)).toBe('You owe €12.50');
  });

  it('labels a zero net as settled', () => {
    expect(balanceChipLabel(0)).toBe('Settled');
  });
});
