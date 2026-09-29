// `Expense.amount` is a `decimal(10, 2)` column: two decimal places, and at
// most eight digits before the point. Validating against that shape keeps a
// sub-cent amount from being silently rounded by Postgres (10.005 → 10.01)
// and an oversized one from surfacing as a raw `numeric field overflow`.
export const MAX_MONEY_AMOUNT = 99_999_999.99;

// Tolerates the binary-float noise of values like 0.29 * 100 = 28.999…96.
const CENT_EPSILON = 1e-6;

export const MONEY_AMOUNT_FORMAT_MESSAGE =
  'Amount must have at most two decimal places and not exceed 99999999.99.';

/** True for a finite, positive amount with at most two decimal places that fits the ledger column. */
export const isStorableMoneyAmount = (value: number): boolean => {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_MONEY_AMOUNT) {
    return false;
  }

  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < CENT_EPSILON;
};
