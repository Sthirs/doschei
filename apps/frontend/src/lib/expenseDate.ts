import type { Expense } from '@/types/group';

/**
 * Parse a `YYYY-MM-DD` string into a *local-time* `Date`.
 *
 * `new Date('2026-01-15')` parses as UTC midnight, which renders as the
 * previous day for any negative-offset locale. Building the date from its
 * parts keeps the displayed day equal to the stored day everywhere.
 */
export const fromDateValue = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * The date an expense should be filed under: its explicit `date` when set,
 * otherwise the date part of its creation timestamp.
 */
export const getExpenseDateValue = (expense: Expense): string => {
  return expense.date || expense.createdAt.slice(0, 10);
};
