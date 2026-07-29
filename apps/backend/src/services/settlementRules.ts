/**
 * Pure settlement validation rules.
 *
 * These functions do NOT touch the database, the request, or any TypeORM entity.
 * They accept already-parsed unknown values (the shape of `req.body`) and return
 * either a typed result or a single human-readable error message. The
 * controller is expected to call `validateSettlementInput` first; if it
 * returns ok, the service then verifies group membership and persists the
 * settlement as an Expense row with `kind: 'SETTLEMENT'`.
 *
 * Membership is a service-layer concern (it needs the loaded group entity),
 * so `validateSettlementInput` takes the list of member ids as a parameter
 * and performs the presence check itself — the controller does not have to
 * repeat it.
 */
export type SettlementInput = {
  paidByUserId: unknown;
  paidToUserId: unknown;
  amount: unknown;
  date?: unknown;
};

export type ParsedSettlement = {
  paidByUserId: string;
  paidToUserId: string;
  amount: number;
  date?: string;
};

export type ValidateSettlementResult =
  | { ok: true; settlement: ParsedSettlement }
  | { ok: false; message: string };

const isFinitePositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Strict YYYY-MM-DD validator: regex + Date round-trip. A non-existent
 * calendar day like `2024-02-30` overflows to March and fails the round-trip
 * check, while a properly formatted `2024-01-15` round-trips unchanged.
 * Reuses the same approach as `isValidExpenseDate` in groupController.ts.
 */
const isValidSettlementDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const validateSettlementInput = (
  input: SettlementInput,
  memberIds: string[],
): ValidateSettlementResult => {
  if (!isNonEmptyString(input.paidByUserId) || !isNonEmptyString(input.paidToUserId)) {
    return { ok: false, message: 'A payer and a payee are required.' };
  }

  const paidByUserId = input.paidByUserId.trim();
  const paidToUserId = input.paidToUserId.trim();

  if (paidByUserId === paidToUserId) {
    return { ok: false, message: 'The payer and the payee must be different people.' };
  }

  if (!memberIds.includes(paidByUserId) || !memberIds.includes(paidToUserId)) {
    return { ok: false, message: 'The selected user is not a member of this group.' };
  }

  if (!isFinitePositiveNumber(input.amount)) {
    return { ok: false, message: 'Settlement amount must be a positive number.' };
  }

  if (input.date !== undefined && input.date !== null) {
    if (typeof input.date !== 'string' || !isValidSettlementDate(input.date)) {
      return { ok: false, message: 'Valid settlement date is required.' };
    }
  }

  return {
    ok: true,
    settlement: {
      paidByUserId,
      paidToUserId,
      amount: input.amount,
      ...(input.date !== undefined && input.date !== null
        ? { date: input.date as string }
        : {}),
    },
  };
};

export const buildSettlementSplit = (
  paidToUserId: string,
  amount: number,
): { userId: string; shareType: 'FIXED'; shareValue: number } => ({
  userId: paidToUserId,
  shareType: 'FIXED',
  shareValue: amount,
});
