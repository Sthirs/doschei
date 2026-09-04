import { describe, it, expect } from 'vitest';

import {
  aggregateMonthlyTotals,
  monthKeyOf,
  monthWindow,
  niceAxis,
  shiftMonthKey,
} from '@/lib/monthlyTotals';

import type { Expense, ExpenseSplit } from '@/types/group';

const split = (userId: string, computedAmount: number): ExpenseSplit => ({
  userId,
  displayName: userId,
  shareType: 'EQUAL',
  shareValue: computedAmount,
  computedAmount,
});

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e1',
  kind: 'EXPENSE',
  description: 'Dinner',
  amount: 100,
  category: 'general',
  paidByName: 'Alice',
  paidByUserId: 'alice',
  settledWithUserId: null,
  settledWithName: null,
  date: '2024-09-10',
  createdAt: '2024-09-10T12:00:00.000Z',
  splits: [split('alice', 50), split('bob', 50)],
  ...over,
});

describe('monthKeyOf', () => {
  it('zero-pads the month', () => {
    expect(monthKeyOf(new Date(2024, 0, 31))).toBe('2024-01');
    expect(monthKeyOf(new Date(2024, 9, 1))).toBe('2024-10');
  });
});

describe('shiftMonthKey', () => {
  it('moves within a year', () => {
    expect(shiftMonthKey('2024-10', -1)).toBe('2024-09');
    expect(shiftMonthKey('2024-10', 1)).toBe('2024-11');
  });

  it('crosses a year boundary in both directions', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-01', -2)).toBe('2025-11');
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01');
  });

  it('does not overflow on a 31-day month', () => {
    // Naive date arithmetic on the 31st slips into the following month.
    expect(shiftMonthKey('2024-03', -1)).toBe('2024-02');
    expect(shiftMonthKey('2024-01', 1)).toBe('2024-02');
  });
});

describe('monthWindow', () => {
  it('returns the anchor plus the two months before it, oldest first', () => {
    expect(monthWindow('2024-10')).toEqual(['2024-08', '2024-09', '2024-10']);
  });

  it('crosses a year boundary', () => {
    expect(monthWindow('2026-01')).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('aggregateMonthlyTotals', () => {
  const keys = ['2024-08', '2024-09', '2024-10'];

  it('returns one zeroed entry per requested month when there is nothing to count', () => {
    expect(aggregateMonthlyTotals([], 'alice', keys)).toEqual([
      { monthKey: '2024-08', groupCents: 0, userCents: 0 },
      { monthKey: '2024-09', groupCents: 0, userCents: 0 },
      { monthKey: '2024-10', groupCents: 0, userCents: 0 },
    ]);
  });

  it('sums group spend and the user share in integer cents', () => {
    const totals = aggregateMonthlyTotals(
      [
        expense({
          id: 'a',
          date: '2024-09-01',
          amount: 40.1,
          splits: [split('alice', 10.05), split('bob', 30.05)],
        }),
        expense({
          id: 'b',
          date: '2024-09-28',
          amount: 19.99,
          splits: [split('alice', 19.99)],
        }),
      ],
      'alice',
      keys,
    );
    expect(totals[1]).toEqual({
      monthKey: '2024-09',
      groupCents: 4010 + 1999,
      userCents: 1005 + 1999,
    });
  });

  it('excludes settlements from both totals', () => {
    const totals = aggregateMonthlyTotals(
      [
        expense({
          id: 'a',
          date: '2024-10-05',
          amount: 60,
          splits: [split('alice', 60)],
        }),
        expense({
          id: 's',
          kind: 'SETTLEMENT',
          date: '2024-10-06',
          amount: 25,
          splits: [split('alice', 25)],
        }),
      ],
      'alice',
      keys,
    );
    expect(totals[2]).toEqual({
      monthKey: '2024-10',
      groupCents: 6000,
      userCents: 6000,
    });
  });

  it('ignores expenses outside the requested window', () => {
    const totals = aggregateMonthlyTotals(
      [
        expense({ id: 'old', date: '2024-07-31', amount: 500 }),
        expense({ id: 'new', date: '2024-11-01', amount: 500 }),
      ],
      'alice',
      keys,
    );
    expect(totals.map((month) => month.groupCents)).toEqual([0, 0, 0]);
  });

  it('files an expense with no explicit date under its creation month', () => {
    const totals = aggregateMonthlyTotals(
      [
        expense({
          date: '',
          createdAt: '2024-08-15T23:30:00.000Z',
          amount: 12,
        }),
      ],
      'alice',
      keys,
    );
    expect(totals[0].groupCents).toBe(1200);
  });

  it('leaves the user share at zero when the user is not a participant', () => {
    const totals = aggregateMonthlyTotals(
      [expense({ date: '2024-09-02', amount: 80, splits: [split('bob', 80)] })],
      'alice',
      keys,
    );
    expect(totals[1]).toEqual({
      monthKey: '2024-09',
      groupCents: 8000,
      userCents: 0,
    });
  });

  it('sums every split belonging to the user rather than only the first', () => {
    const totals = aggregateMonthlyTotals(
      [
        expense({
          date: '2024-09-02',
          amount: 30,
          splits: [split('alice', 10), split('alice', 20)],
        }),
      ],
      'alice',
      keys,
    );
    expect(totals[1].userCents).toBe(3000);
  });
});

describe('niceAxis', () => {
  it('reproduces the design: €1,040 of spend gives a €1,200 axis in €400 steps', () => {
    expect(niceAxis(104_000)).toEqual({
      maxCents: 120_000,
      tickCents: [120_000, 80_000, 40_000, 0],
    });
  });

  it('always leaves the top tick at or above the tallest bar', () => {
    for (const maxCents of [
      1, 999, 65_000, 79_000, 104_000, 250_000, 1_234_567,
    ]) {
      expect(niceAxis(maxCents).maxCents).toBeGreaterThanOrEqual(maxCents);
    }
  });

  it('keeps an exact multiple on the ladder instead of rounding it up a step', () => {
    expect(niceAxis(150_000).maxCents).toBe(150_000);
  });

  it('falls back to a readable axis when nothing was spent', () => {
    expect(niceAxis(0)).toEqual({
      maxCents: 30_000,
      tickCents: [30_000, 20_000, 10_000, 0],
    });
  });

  it('emits four ticks in descending order, ending at zero', () => {
    const { tickCents } = niceAxis(87_321);
    expect(tickCents).toHaveLength(4);
    expect(tickCents[3]).toBe(0);
    expect([...tickCents].sort((a, b) => b - a)).toEqual(tickCents);
  });

  it('uses whole cents for every tick', () => {
    for (const maxCents of [7, 101, 3_333, 104_000]) {
      for (const tick of niceAxis(maxCents).tickCents) {
        expect(Number.isInteger(tick)).toBe(true);
      }
    }
  });
});
