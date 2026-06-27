import type { ExpenseSplit } from '@/types/group';

/**
 * Deterministic cent-remainder algorithm for equal splits.
 * Distributes amountCents across userIds, giving the first `remainder` users
 * one extra cent each. Returns shareValue in euros (2 decimals).
 */
export const computeEqualFixedSplits = (
  amountCents: number,
  userIds: string[],
): Array<{ userId: string; shareValue: number }> => {
  if (userIds.length === 0) return [];

  const safeCents = Math.max(0, Math.round(amountCents));
  const base = Math.floor(safeCents / userIds.length);
  const remainder = safeCents - base * userIds.length;

  return userIds.map((userId, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    return {
      userId,
      shareValue: Number((cents / 100).toFixed(2)),
    };
  });
};

/**
 * Detects the split mode and prefills values from existing splits.
 * Used by the edit modal to pre-populate state from a loaded expense.
 */
export const splitModeFromExistingSplits = (
  splits: ExpenseSplit[] | undefined,
): {
  mode: 'EQUAL' | 'PERCENT' | 'FIXED';
  selectedUserIds: string[];
  percentValues: Record<string, number>;
  fixedValues: Record<string, number>;
} => {
  if (!splits || splits.length === 0) {
    return {
      mode: 'EQUAL',
      selectedUserIds: [],
      percentValues: {},
      fixedValues: {},
    };
  }

  const allPercent = splits.every((split) => split.shareType === 'PERCENT');
  const allFixed = splits.every((split) => split.shareType === 'FIXED');

  if (allPercent) {
    const percentValues: Record<string, number> = {};
    const selectedUserIds: string[] = [];
    for (const split of splits) {
      selectedUserIds.push(split.userId);
      percentValues[split.userId] = split.shareValue;
    }
    return {
      mode: 'PERCENT',
      selectedUserIds,
      percentValues,
      fixedValues: {},
    };
  }

  if (allFixed) {
    const fixedValues: Record<string, number> = {};
    const selectedUserIds: string[] = [];
    for (const split of splits) {
      selectedUserIds.push(split.userId);
      fixedValues[split.userId] = split.shareValue;
    }
    return {
      mode: 'FIXED',
      selectedUserIds,
      percentValues: {},
      fixedValues,
    };
  }

  // Mixed share types (shouldn't happen per contract, but handle gracefully)
  // Default to FIXED mode with all users selected
  const fixedValues: Record<string, number> = {};
  const selectedUserIds: string[] = [];
  for (const split of splits) {
    selectedUserIds.push(split.userId);
    fixedValues[split.userId] = split.shareValue;
  }
  return {
    mode: 'FIXED',
    selectedUserIds,
    percentValues: {},
    fixedValues,
  };
};
