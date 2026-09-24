import { CATEGORIES_GROUPED, getCategory } from '@/lib/categories';
import { getExpenseDateValue } from '@/lib/expenseDate';
import { toCents } from '@/lib/monthlyTotals';

import type { CategoryFamily } from '@/lib/categories';
import type { MonthKey } from '@/lib/monthlyTotals';
import type { Expense } from '@/types/group';

/** One family's amount and share of a month's spend, per ADR-0026. */
export type CategoryRecapRow = {
  family: CategoryFamily;
  cents: number;
  /** Integer tenths of a percent, e.g. `388` for `38.8%`. */
  shareTenths: number;
};

/** A month's spend broken down by category family, plus its own-share summary. */
export type CategoryRecap = {
  rows: CategoryRecapRow[];
  totalCents: number;
  userCents: number;
  expenseCount: number;
};

// The family display order, shared with the category picker so the two
// surfaces never disagree about "family order" (see `CATEGORIES_GROUPED`).
// Rows always render in this order — never re-sorted by amount — so a family
// doesn't jump position from one month to the next (ADR-0026 §Decision item 3).
const FAMILY_ORDER: CategoryFamily[] = CATEGORIES_GROUPED.map((g) => g.family);

/**
 * Total group spend for `monthKey`, broken down by category family, plus the
 * signed-in user's share of it.
 *
 * Settlements are excluded, for the same reason as `aggregateMonthlyTotals`:
 * a settle-up moves money between members and is not spending.
 */
export const aggregateCategoryRecap = (
  expenses: Expense[],
  currentUserId: string,
  monthKey: MonthKey,
): CategoryRecap => {
  const byFamily = new Map<CategoryFamily, number>(
    FAMILY_ORDER.map((family) => [family, 0]),
  );
  let userCents = 0;
  let expenseCount = 0;

  for (const expense of expenses) {
    if (expense.kind !== 'EXPENSE') continue;
    if (getExpenseDateValue(expense).slice(0, 7) !== monthKey) continue;

    const family = getCategory(expense.category).family;
    const cents = toCents(expense.amount);
    byFamily.set(family, (byFamily.get(family) ?? 0) + cents);
    expenseCount += 1;

    // Summed rather than `find`-ed so a duplicated participant row cannot
    // silently drop cents from the user's share (ADR-0022 §2).
    for (const split of expense.splits) {
      if (split.userId === currentUserId) {
        userCents += toCents(split.computedAmount);
      }
    }
  }

  const totalCents = Array.from(byFamily.values()).reduce((a, b) => a + b, 0);

  // Every family is shown, including at zero (ADR-0026 §Decision item 3), and
  // always in `FAMILY_ORDER` rather than re-sorted by amount, so a family's
  // row doesn't jump position from one month to the next.
  const rows = FAMILY_ORDER.map((family) => {
    const cents = byFamily.get(family) as number;
    const shareTenths = totalCents > 0 ? Math.round((cents * 1000) / totalCents) : 0;
    return { family, cents, shareTenths };
  });

  return { rows, totalCents, userCents, expenseCount };
};
