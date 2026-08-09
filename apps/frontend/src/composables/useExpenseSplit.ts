import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

import { splitModeFromExistingSplits } from '@/lib/splitMath';
import type { ExpenseSplit, GroupMember, ShareType } from '@/types/group';

export type SplitValueMap = Record<string, number | ''>;

export type UseExpenseSplitReturn = {
  selectedSplitUserIds: Ref<string[]>;
  splitMode: Ref<ShareType>;
  percentValues: Ref<SplitValueMap>;
  fixedValues: Ref<SplitValueMap>;
  percentSum: ComputedRef<number>;
  fixedSum: ComputedRef<number>;
  equalSplitPerPerson: (amount: number) => number;
  isSplitValid: (amount: number) => boolean;
  splitErrorMessage: (amount: number) => string;
  toggleSplitUser: (userId: string) => void;
  buildSplitPayload: () => ExpenseSplit[];
};

const sumSelectedValues = (
  userIds: ReadonlyArray<string>,
  values: SplitValueMap,
): number => {
  let sum = 0;
  for (const userId of userIds) {
    const val = values[userId];
    if (typeof val === 'number') sum += val;
  }
  return sum;
};

const findDisplayName = (
  members: ReadonlyArray<GroupMember>,
  userId: string,
): string => members.find((m) => m.id === userId)?.displayName ?? '';

const numberOrZero = (values: SplitValueMap, userId: string): number => {
  const val = values[userId];
  return typeof val === 'number' ? val : 0;
};

/**
 * Encapsulates shared split state and logic for Add/Edit expense flows.
 * Drop-in replacement for the duplicated split state in GroupDetailView.
 */
export const useExpenseSplit = (
  members: Ref<GroupMember[]>,
  initialSplits?: ExpenseSplit[],
): UseExpenseSplitReturn => {
  const selectedSplitUserIds = ref<string[]>([]);
  const splitMode = ref<ShareType>('EQUAL');
  const percentValues = ref<SplitValueMap>({});
  const fixedValues = ref<SplitValueMap>({});

  const initialize = (): void => {
    const allMemberIds = members.value.map((m) => m.id);
    const detected = splitModeFromExistingSplits(initialSplits);

    if (detected.selectedUserIds.length === 0) {
      // No existing splits: default to all members, EQUAL mode
      selectedSplitUserIds.value = allMemberIds;
      splitMode.value = 'EQUAL';
      percentValues.value = {};
      fixedValues.value = {};
      return;
    }

    selectedSplitUserIds.value = [...detected.selectedUserIds];
    splitMode.value = detected.mode;
    percentValues.value = {};
    fixedValues.value = {};
    for (const userId of detected.selectedUserIds) {
      if (detected.mode === 'PERCENT') {
        percentValues.value[userId] = detected.percentValues[userId] ?? '';
      } else if (detected.mode === 'FIXED') {
        fixedValues.value[userId] = detected.fixedValues[userId] ?? '';
      }
    }
  };

  initialize();

  // Re-initialize when the source splits change (e.g., edit modal reopened
  // for a different expense) so we don't carry stale state across opens.
  if (initialSplits) {
    watch(() => initialSplits, () => initialize(), { deep: true });
  }

  const percentSum = computed(() =>
    sumSelectedValues(selectedSplitUserIds.value, percentValues.value),
  );
  const fixedSum = computed(() =>
    sumSelectedValues(selectedSplitUserIds.value, fixedValues.value),
  );

  const equalSplitPerPerson = (amount: number): number => {
    if (!amount || amount <= 0 || selectedSplitUserIds.value.length === 0) {
      return 0;
    }
    return amount / selectedSplitUserIds.value.length;
  };

  const isSplitValid = (amount: number): boolean => {
    if (selectedSplitUserIds.value.length === 0) return false;
    if (splitMode.value === 'PERCENT') {
      return Math.abs(percentSum.value - 100) <= 0.01;
    }
    if (splitMode.value === 'FIXED') {
      if (!amount || amount <= 0) return false;
      return Math.abs(fixedSum.value - amount) <= 0.01;
    }
    // EQUAL is always valid with at least one user selected
    return true;
  };

  const splitErrorMessage = (amount: number): string => {
    if (selectedSplitUserIds.value.length === 0) {
      return 'Select at least one person to split with.';
    }
    if (splitMode.value === 'PERCENT') {
      if (Math.abs(percentSum.value - 100) > 0.01) {
        return `Percentages must sum to 100 (current: ${percentSum.value.toFixed(2)}).`;
      }
    }
    if (splitMode.value === 'FIXED') {
      if (amount && amount > 0 && Math.abs(fixedSum.value - amount) > 0.01) {
        return `Fixed amounts must sum to \u20AC${amount.toFixed(2)} (current: \u20AC${fixedSum.value.toFixed(2)}).`;
      }
    }
    return '';
  };

  const toggleSplitUser = (userId: string): void => {
    const idx = selectedSplitUserIds.value.indexOf(userId);
    if (idx >= 0) {
      selectedSplitUserIds.value.splice(idx, 1);
      // Clean up stale value-map entries so they don't leak between toggles
      delete percentValues.value[userId];
      delete fixedValues.value[userId];
      return;
    }
    selectedSplitUserIds.value.push(userId);
  };

  const buildSplitPayload = (): ExpenseSplit[] => {
    const memberLookup = members.value;
    const userIds = selectedSplitUserIds.value;
    const mode = splitMode.value;

    if (mode === 'EQUAL') {
      return userIds.map((userId) => ({
        userId,
        displayName: findDisplayName(memberLookup, userId),
        shareType: 'EQUAL' as const,
        shareValue: 0,
        computedAmount: 0,
      }));
    }
    if (mode === 'PERCENT') {
      return userIds.map((userId) => ({
        userId,
        displayName: findDisplayName(memberLookup, userId),
        shareType: 'PERCENT' as const,
        shareValue: numberOrZero(percentValues.value, userId),
        computedAmount: 0,
      }));
    }
    // FIXED
    return userIds.map((userId) => {
      const fixed = numberOrZero(fixedValues.value, userId);
      return {
        userId,
        displayName: findDisplayName(memberLookup, userId),
        shareType: 'FIXED' as const,
        shareValue: fixed,
        computedAmount: fixed,
      };
    });
  };

  return {
    selectedSplitUserIds,
    splitMode,
    percentValues,
    fixedValues,
    percentSum,
    fixedSum,
    equalSplitPerPerson,
    isSplitValid,
    splitErrorMessage,
    toggleSplitUser,
    buildSplitPayload,
  };
};
