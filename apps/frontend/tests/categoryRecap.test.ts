import { describe, it, expect } from 'vitest';

import { aggregateCategoryRecap } from '@/lib/categoryRecap';

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
  date: '2024-10-10',
  createdAt: '2024-10-10T12:00:00.000Z',
  splits: [split('alice', 50), split('bob', 50)],
  ...over,
});

// Mirrors the "Group Detail (Category Recap)" mockup's per-family amounts,
// split across 8 expenses (Home split into two) so both the 7-family and
// 8-expense figures from the mockup are exercised at once.
const mockupExpenses: Expense[] = [
  expense({ id: 'rent', category: 'rent', amount: 100.2, splits: [split('alice', 50.1), split('bob', 50.1)] }),
  expense({ id: 'mortgage', category: 'mortgage', amount: 86, splits: [split('alice', 43), split('bob', 43)] }),
  expense({ id: 'dining-out', category: 'dining-out', amount: 154, splits: [split('alice', 77), split('bob', 77)] }),
  expense({ id: 'movies', category: 'movies', amount: 48, splits: [split('alice', 24), split('bob', 24)] }),
  expense({ id: 'taxi', category: 'taxi', amount: 34.8, splits: [split('alice', 17.4), split('bob', 17.4)] }),
  expense({ id: 'gifts', category: 'gifts', amount: 28.5, splits: [split('alice', 14.25), split('bob', 14.25)] }),
  expense({ id: 'electricity', category: 'electricity', amount: 16, splits: [split('alice', 8), split('bob', 8)] }),
  expense({ id: 'general', category: 'general', amount: 12.5, splits: [split('alice', 6.25), split('bob', 6.25)] }),
];

describe('aggregateCategoryRecap', () => {
  it('matches the mockup figures, always in the fixed family order, correct shares and totals', () => {
    const recap = aggregateCategoryRecap(mockupExpenses, 'alice', '2024-10');

    expect(recap.totalCents).toBe(48_000);
    expect(recap.expenseCount).toBe(8);
    expect(recap.userCents).toBe(24_000);
    // Family order is food-and-drink, transportation, home, life, utilities,
    // entertainment, uncategorized (CATEGORIES_GROUPED) — NOT sorted by amount.
    expect(recap.rows).toEqual([
      { family: 'food-and-drink', cents: 15_400, shareTenths: 321 },
      { family: 'transportation', cents: 3_480, shareTenths: 73 },
      { family: 'home', cents: 18_620, shareTenths: 388 },
      { family: 'life', cents: 2_850, shareTenths: 59 },
      { family: 'utilities', cents: 1_600, shareTenths: 33 },
      { family: 'entertainment', cents: 4_800, shareTenths: 100 },
      { family: 'uncategorized', cents: 1_250, shareTenths: 26 },
    ]);
  });

  it('excludes settlements from every family and from the total', () => {
    const withSettlement = [
      ...mockupExpenses,
      expense({
        id: 'settle',
        kind: 'SETTLEMENT',
        amount: 9999,
        category: 'general',
        date: '2024-10-15',
      }),
    ];
    expect(aggregateCategoryRecap(withSettlement, 'alice', '2024-10').totalCents).toBe(48_000);
  });

  it('excludes expenses outside the requested month', () => {
    const otherMonth = expense({ id: 'sept', category: 'rent', amount: 500, date: '2024-09-05' });
    const recap = aggregateCategoryRecap([...mockupExpenses, otherMonth], 'alice', '2024-10');
    expect(recap.totalCents).toBe(48_000);
  });

  it('counts an unrecognized category key as uncategorized', () => {
    const recap = aggregateCategoryRecap(
      [expense({ id: 'e1', category: 'not-a-real-category', amount: 10 })],
      'alice',
      '2024-10',
    );
    const uncategorized = recap.rows.find((r) => r.family === 'uncategorized');
    expect(uncategorized?.cents).toBe(1_000);
  });

  it('sums every matching split rather than stopping at the first match', () => {
    const withDuplicateParticipant = expense({
      id: 'dup',
      category: 'rent',
      amount: 100,
      splits: [split('alice', 20), split('alice', 30), split('bob', 50)],
    });
    const recap = aggregateCategoryRecap([withDuplicateParticipant], 'alice', '2024-10');
    expect(recap.userCents).toBe(5_000);
  });

  it('always returns all seven families, in family order, at zero for an empty month', () => {
    const recap = aggregateCategoryRecap([], 'alice', '2024-11');
    expect(recap.totalCents).toBe(0);
    expect(recap.userCents).toBe(0);
    expect(recap.expenseCount).toBe(0);
    expect(recap.rows).toEqual([
      { family: 'food-and-drink', cents: 0, shareTenths: 0 },
      { family: 'transportation', cents: 0, shareTenths: 0 },
      { family: 'home', cents: 0, shareTenths: 0 },
      { family: 'life', cents: 0, shareTenths: 0 },
      { family: 'utilities', cents: 0, shareTenths: 0 },
      { family: 'entertainment', cents: 0, shareTenths: 0 },
      { family: 'uncategorized', cents: 0, shareTenths: 0 },
    ]);
  });

  it('keeps the fixed family order even when a later family has more spend than an earlier one', () => {
    const uneven = [
      expense({ id: 'a', category: 'general', amount: 10 }), // uncategorized: last
      expense({ id: 'b', category: 'movies', amount: 999 }), // entertainment: 6th, but the biggest amount
    ];
    const recap = aggregateCategoryRecap(uneven, 'alice', '2024-10');
    const nonZero = recap.rows.filter((r) => r.cents > 0).map((r) => r.family);
    // Family order is food-and-drink, transportation, home, life, utilities,
    // entertainment, uncategorized (CATEGORIES_GROUPED) — entertainment stays
    // before uncategorized despite having far more spend.
    expect(nonZero).toEqual(['entertainment', 'uncategorized']);
  });
});
