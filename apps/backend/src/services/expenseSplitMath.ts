import type { ShareType } from '../entities/ExpenseSplit';

export type ParsedSplit = {
  userId: string;
  shareType: ShareType;
  shareValue: number;
};

export type AllocatedSplit = ParsedSplit & {
  computedAmount: number;
};

export type ValidateSplitsResult =
  | { ok: true; splits: ParsedSplit[] }
  | { ok: false; message: string };

export type AggregateBalanceInput = {
  paidByUserId: string;
  splits: { userId: string; computedAmount: number }[];
};

const SHARES_EPSILON_CENTS = 1; // 0.01 in decimal terms — one cent is the smallest unit of money.

const toCents = (value: number): number => Math.round(value * 100);

const isFinitePositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Pure validator for the `splits` array on POST/PATCH expense payloads.
 * Does NOT check group membership (that is a service-layer concern that
 * needs the loaded group entity). The controller calls this first; if it
 * returns ok, the service then verifies each split userId against the
 * group's eager-loaded members list.
 */
export const validateSplits = (
  splits: unknown,
  amount: number,
): ValidateSplitsResult => {
  if (!Array.isArray(splits) || splits.length === 0) {
    return { ok: false, message: 'At least one split is required.' };
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Expense amount must be a positive number.' };
  }

  const parsed: ParsedSplit[] = [];
  for (const raw of splits) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, message: 'Each split requires userId, shareType, and a positive shareValue.' };
    }

    const candidate = raw as Record<string, unknown>;

    if (typeof candidate.userId !== 'string' || candidate.userId.length === 0) {
      return { ok: false, message: 'Each split requires userId, shareType, and a positive shareValue.' };
    }

    if (candidate.shareType !== 'PERCENT' && candidate.shareType !== 'FIXED' && candidate.shareType !== 'EQUAL') {
      return { ok: false, message: 'Each split requires userId, shareType, and a positive shareValue.' };
    }

    if (candidate.shareType === 'EQUAL') {
      if (typeof candidate.shareValue !== 'number' || !Number.isFinite(candidate.shareValue)) {
        return { ok: false, message: 'Each split requires userId, shareType, and a numeric shareValue.' };
      }
    } else {
      if (!isFinitePositiveNumber(candidate.shareValue)) {
        return { ok: false, message: 'Each split requires userId, shareType, and a positive shareValue.' };
      }
    }

    parsed.push({
      userId: candidate.userId,
      shareType: candidate.shareType,
      shareValue: candidate.shareValue,
    });
  }

  const firstShareType = parsed[0].shareType;
  for (const entry of parsed) {
    if (entry.shareType !== firstShareType) {
      return { ok: false, message: 'All splits must use the same share type.' };
    }
  }

  if (firstShareType === 'PERCENT') {
    const sumCents = parsed.reduce((acc, entry) => acc + toCents(entry.shareValue), 0);
    const targetCents = 10000; // 100.00 in cents
    if (Math.abs(sumCents - targetCents) > SHARES_EPSILON_CENTS) {
      return { ok: false, message: 'Percentages must sum to 100.' };
    }
  } else if (firstShareType === 'FIXED') {
    const sumCents = parsed.reduce((acc, entry) => acc + toCents(entry.shareValue), 0);
    const amountCents = toCents(amount);
    if (Math.abs(sumCents - amountCents) > SHARES_EPSILON_CENTS) {
      return { ok: false, message: 'Fixed amounts must sum to the expense total.' };
    }
  }
  // EQUAL: no sum validation — backend normalizes shareValue later

  return { ok: true, splits: parsed };
};

/**
 * Pure cent-precise allocator. For PERCENT splits it uses Math.floor to
 * avoid rounding the total over amount, then distributes the leftover
 * remainder one cent at a time in input order. For FIXED splits each
 * computedAmount equals its shareValue (validation already enforced the
 * sum). The function throws if a malformed FIXED input slips past
 * validation — the controller should never produce that state.
 */
export const computeAllocatedAmounts = (
  amount: number,
  splits: ParsedSplit[],
): AllocatedSplit[] => {
  if (splits.length === 0) {
    return [];
  }

  const amountCents = toCents(amount);
  const shareType = splits[0].shareType;

  if (shareType === 'PERCENT') {
    const allocatedCents = splits.map((entry) =>
      Math.floor(amountCents * (entry.shareValue / 100)),
    );
    const allocatedSum = allocatedCents.reduce((acc, cents) => acc + cents, 0);
    const remainder = amountCents - allocatedSum;

    for (let i = 0; i < remainder; i += 1) {
      allocatedCents[i % allocatedCents.length] += 1;
    }

    return splits.map((entry, index) => ({
      userId: entry.userId,
      shareType: entry.shareType,
      shareValue: entry.shareValue,
      computedAmount: allocatedCents[index] / 100,
    }));
  }

  if (shareType === 'EQUAL') {
    const n = splits.length;
    const amountCents = toCents(amount);

    // Allocate amount directly in cents — base share + remainder distributed in input order.
    const base = Math.floor(amountCents / n);
    const remainder = amountCents - base * n;

    // Derive display percentages (must sum to 100.00 for display/round-trip consistency).
    // IMPORTANT: shareValue is a derived percent for display only — it may not satisfy
    // shareValue × amount = computedAmount due to independent rounding. This is intentional:
    // EQUAL shareValue is never displayed to users (the frontend computes amount/userCount
    // fresh) and balances are computed from computedAmount via aggregateBalance, not from
    // shareValue.
    const percentCentsEach = Math.floor(10000 / n);
    const percentRemainder = 10000 - percentCentsEach * n;

    return splits.map((entry, index) => ({
      userId: entry.userId,
      shareType: 'EQUAL' as const,
      shareValue: (percentCentsEach + (index < percentRemainder ? 1 : 0)) / 100,
      computedAmount: (base + (index < remainder ? 1 : 0)) / 100,
    }));
  }

  if (shareType === 'FIXED') {
    const totalCents = splits.reduce((acc, entry) => acc + toCents(entry.shareValue), 0);
    if (Math.abs(totalCents - amountCents) > SHARES_EPSILON_CENTS) {
      throw new Error('Fixed amounts must sum to the expense total.');
    }

    return splits.map((entry) => ({
      userId: entry.userId,
      shareType: entry.shareType,
      shareValue: entry.shareValue,
      computedAmount: entry.shareValue,
    }));
  }

  throw new Error(`Unsupported shareType: ${shareType as string}`);
};

/**
 * Pure pairwise balance aggregator. All math happens in integer cents so
 * the per-user entries and the net total stay in lock-step (rounded to
 * 2 decimals for display) and `sum(perUser) === netForCurrentUser` holds
 * exactly.
 *
 * The contract says "netForCurrentUser > 0" means others owe the
 * current user. We model that directly: when currentUser is the payer,
 * each non-payer split increases currentUser's receivable from that
 * other user; when currentUser is a non-payer split, currentUser's
 * payable to the payer grows.
 */
export const aggregateBalance = (
  expenses: AggregateBalanceInput[],
  currentUserId: string,
): { netForCurrentUser: number; perUser: Map<string, number> } => {
  const perUserCents = new Map<string, number>();
  let netCents = 0;

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.userId === expense.paidByUserId) {
        continue;
      }

      const cents = toCents(split.computedAmount);

      if (expense.paidByUserId === currentUserId) {
        perUserCents.set(split.userId, (perUserCents.get(split.userId) ?? 0) + cents);
        netCents += cents;
      } else if (split.userId === currentUserId) {
        perUserCents.set(
          expense.paidByUserId,
          (perUserCents.get(expense.paidByUserId) ?? 0) - cents,
        );
        netCents -= cents;
      }
    }
  }

  const perUser = new Map<string, number>();
  for (const [userId, cents] of perUserCents) {
    if (cents !== 0) {
      perUser.set(userId, cents / 100);
    }
  }

  return {
    netForCurrentUser: netCents / 100,
    perUser,
  };
};
