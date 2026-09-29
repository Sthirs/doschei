// Mirrors the backend's `isStorableMoneyAmount` (apps/backend/src/utils/money.ts):
// the ledger column is decimal(10, 2), so the API rejects an amount with more
// than two decimals or above this ceiling. Checking it here keeps the form's
// Save disabled with a clear message instead of a generic save failure.
export const MAX_AMOUNT = 99_999_999.99;

// Tolerates the binary-float noise of values like 0.29 * 100 = 28.999…96.
const CENT_EPSILON = 1e-6;

export const hasStorablePrecision = (value: number): boolean => {
  if (!Number.isFinite(value) || value > MAX_AMOUNT) return false;
  const cents = value * 100;
  return Math.abs(cents - Math.round(cents)) < CENT_EPSILON;
};
