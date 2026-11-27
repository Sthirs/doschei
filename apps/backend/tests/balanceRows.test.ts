import { describe, expect, it } from 'vitest';

import {
  aggregateNetForUser,
  type AggregateBalanceInput,
} from '../src/services/expenseSplitMath';
import {
  foldBalanceRows,
  type BalanceRow,
} from '../src/services/group/balanceRows';

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';

const row = (
  groupId: string,
  expenseId: string,
  paidById: string,
  splitUserId: string | null,
  amount: string | null,
): BalanceRow => ({
  group_id: groupId,
  expense_id: expenseId,
  paid_by_id: paidById,
  split_user_id: splitUserId,
  split_computed_amount: amount,
});

describe('foldBalanceRows', () => {
  it('returns an empty map for no rows', () => {
    expect(foldBalanceRows([])).toEqual(new Map());
  });

  it('collapses the split rows of one expense into a single entry', () => {
    const result = foldBalanceRows([
      row('g1', 'e1', ALICE, ALICE, '10.00'),
      row('g1', 'e1', ALICE, BOB, '10.00'),
      row('g1', 'e1', ALICE, CAROL, '10.00'),
    ]);

    expect(result.get('g1')).toEqual([
      {
        paidByUserId: ALICE,
        splits: [
          { userId: ALICE, computedAmount: 10 },
          { userId: BOB, computedAmount: 10 },
          { userId: CAROL, computedAmount: 10 },
        ],
      },
    ]);
  });

  it('buckets expenses per group, keeping each group in row order', () => {
    const result = foldBalanceRows([
      row('g1', 'e1', ALICE, BOB, '5.00'),
      row('g2', 'e2', BOB, ALICE, '7.00'),
      row('g1', 'e3', BOB, ALICE, '3.00'),
    ]);

    expect([...result.keys()]).toEqual(['g1', 'g2']);
    expect(result.get('g1')?.map((entry) => entry.paidByUserId)).toEqual([
      ALICE,
      BOB,
    ]);
    expect(result.get('g2')).toEqual([
      { paidByUserId: BOB, splits: [{ userId: ALICE, computedAmount: 7 }] },
    ]);
  });

  it('keeps an expense with no splits (null left-join columns) as an entry with no splits', () => {
    const result = foldBalanceRows([row('g1', 'e1', ALICE, null, null)]);

    expect(result.get('g1')).toEqual([{ paidByUserId: ALICE, splits: [] }]);
  });

  it('converts Postgres numeric strings to numbers', () => {
    const result = foldBalanceRows([
      row('g1', 'e1', ALICE, BOB, '12.50'),
      row('g1', 'e1', ALICE, CAROL, '0.01'),
    ]);

    const amounts = result.get('g1')?.[0].splits.map((s) => s.computedAmount);
    expect(amounts).toEqual([12.5, 0.01]);
    expect(amounts?.every((value) => typeof value === 'number')).toBe(true);
  });

  it('gives the same net balance as the entity-shaped input it replaced, for a mixed EQUAL/FIXED/PERCENT + SETTLEMENT ledger', () => {
    // The shape `getGroupsForUser` used to build from full Expense entities.
    const ledger: AggregateBalanceInput[] = [
      // EQUAL 30.00 paid by Alice across all three (10.00 each).
      {
        paidByUserId: ALICE,
        splits: [
          { userId: ALICE, computedAmount: 10 },
          { userId: BOB, computedAmount: 10 },
          { userId: CAROL, computedAmount: 10 },
        ],
      },
      // FIXED 20.00 paid by Bob: Alice 12.35, Bob 7.65.
      {
        paidByUserId: BOB,
        splits: [
          { userId: ALICE, computedAmount: 12.35 },
          { userId: BOB, computedAmount: 7.65 },
        ],
      },
      // PERCENT 50.00 paid by Carol: 60% Alice, 40% Carol.
      {
        paidByUserId: CAROL,
        splits: [
          { userId: ALICE, computedAmount: 30 },
          { userId: CAROL, computedAmount: 20 },
        ],
      },
      // SETTLEMENT: Bob pays Alice 4.00.
      { paidByUserId: BOB, splits: [{ userId: ALICE, computedAmount: 4 }] },
    ];

    const rows: BalanceRow[] = ledger.flatMap((expense, index) =>
      expense.splits.map((split) =>
        row(
          'g1',
          `e${index}`,
          expense.paidByUserId,
          split.userId,
          split.computedAmount.toFixed(2),
        ),
      ),
    );
    const folded = foldBalanceRows(rows).get('g1') ?? [];

    expect(folded).toEqual(ledger);
    for (const userId of [ALICE, BOB, CAROL]) {
      expect(aggregateNetForUser(folded, userId)).toBe(
        aggregateNetForUser(ledger, userId),
      );
    }
    // Alice: +20 (EQUAL) −12.35 (FIXED) −30 (PERCENT) −4 (settlement received).
    expect(aggregateNetForUser(folded, ALICE)).toBe(-26.35);
  });
});
