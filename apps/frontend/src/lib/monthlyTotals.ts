import { getExpenseDateValue } from '@/lib/expenseDate';

import type { Expense } from '@/types/group';

/** A calendar month, `YYYY-MM`. Sorts correctly as a plain string. */
export type MonthKey = string;

/** Group spend and the signed-in user's share of it, for one month. */
export type MonthlyTotal = {
  monthKey: MonthKey;
  groupCents: number;
  userCents: number;
};

/** The axis a chart should draw: its top value plus four tick values, top to bottom. */
export type Axis = {
  maxCents: number;
  tickCents: number[];
};

/** Number of months shown side by side. */
export const WINDOW_MONTHS = 3;

// Per ADR-0006 all money arithmetic runs on integer cents; the `/ 100` happens
// only where a value is formatted for display.
const toCents = (value: number): number => Math.round(Number(value) * 100);

export const monthKeyOf = (date: Date): MonthKey =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const shiftMonthKey = (key: MonthKey, delta: number): MonthKey => {
  const [year, month] = key.split('-').map(Number);
  // Day 1 keeps the arithmetic month-length agnostic, and `Date` normalizes an
  // out-of-range month index into the neighbouring year for us.
  return monthKeyOf(new Date(year, month - 1 + delta, 1));
};

/** The `WINDOW_MONTHS` keys ending at `anchor` inclusive, oldest first. */
export const monthWindow = (anchor: MonthKey): MonthKey[] =>
  Array.from({ length: WINDOW_MONTHS }, (_, i) =>
    shiftMonthKey(anchor, i - (WINDOW_MONTHS - 1)),
  );

/**
 * Total group spend and the current user's share per month.
 *
 * Settlements are excluded: a settle-up moves money between two members and is
 * not spending, so counting it would inflate both totals.
 */
export const aggregateMonthlyTotals = (
  expenses: Expense[],
  currentUserId: string,
  monthKeys: MonthKey[],
): MonthlyTotal[] => {
  const totals = new Map<MonthKey, MonthlyTotal>(
    monthKeys.map((monthKey) => [
      monthKey,
      { monthKey, groupCents: 0, userCents: 0 },
    ]),
  );

  for (const expense of expenses) {
    if (expense.kind !== 'EXPENSE') continue;
    const bucket = totals.get(getExpenseDateValue(expense).slice(0, 7));
    if (!bucket) continue;

    bucket.groupCents += toCents(expense.amount);
    // Summed rather than `find`-ed so a duplicated participant row cannot
    // silently drop cents from the user's share.
    for (const split of expense.splits) {
      if (split.userId === currentUserId) {
        bucket.userCents += toCents(split.computedAmount);
      }
    }
  }

  return monthKeys.map((monthKey) => totals.get(monthKey) as MonthlyTotal);
};

// Round step sizes, as multiples of a power of ten. The axis shows three equal
// steps, so the step is the smallest of these that covers a third of the tallest
// bar: €1,040 of spend gives a €400 step and a €1,200 axis.
const STEP_LADDER = [1, 2, 2.5, 4, 5, 10];

// Axis used when nothing was spent, so the chart still reads as a chart.
const EMPTY_AXIS_STEP_CENTS = 10_000;

export const niceAxis = (maxCents: number): Axis => {
  const step =
    maxCents > 0 ? niceStep(maxCents / WINDOW_MONTHS) : EMPTY_AXIS_STEP_CENTS;
  return { maxCents: step * 3, tickCents: [step * 3, step * 2, step, 0] };
};

const niceStep = (rawCents: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(rawCents));
  const candidate =
    STEP_LADDER.map((m) => m * magnitude).find((s) => s >= rawCents) ??
    10 * magnitude;
  return Math.ceil(candidate);
};
