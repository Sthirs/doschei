import type { AggregateBalanceInput } from '../expenseSplitMath';

/**
 * One row of the lean balance query in `getGroupsForUser`: an expense joined
 * to one of its splits. `split_user_id` / `split_computed_amount` are null
 * for an expense with no splits (left join). Postgres returns `numeric`
 * columns as strings.
 */
export type BalanceRow = {
  group_id: string;
  expense_id: string;
  paid_by_id: string;
  split_user_id: string | null;
  split_computed_amount: string | number | null;
};

/**
 * Folds the flat expense × split rows into the per-group
 * `AggregateBalanceInput[]` that `aggregateNetForUser` consumes — one entry
 * per expense, carrying all of its splits.
 */
export function foldBalanceRows(
  rows: readonly BalanceRow[],
): Map<string, AggregateBalanceInput[]> {
  const byGroup = new Map<string, AggregateBalanceInput[]>();
  const byExpense = new Map<string, AggregateBalanceInput>();

  for (const row of rows) {
    let entry = byExpense.get(row.expense_id);
    if (!entry) {
      entry = { paidByUserId: row.paid_by_id, splits: [] };
      byExpense.set(row.expense_id, entry);
      const list = byGroup.get(row.group_id);
      if (list) {
        list.push(entry);
      } else {
        byGroup.set(row.group_id, [entry]);
      }
    }

    if (row.split_user_id !== null) {
      entry.splits.push({
        userId: row.split_user_id,
        computedAmount: Number(row.split_computed_amount),
      });
    }
  }

  return byGroup;
}
