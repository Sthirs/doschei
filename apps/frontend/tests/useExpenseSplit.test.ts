import { describe, it, expect } from 'vitest';
import { ref } from 'vue';

import { useExpenseSplit } from '@/composables/useExpenseSplit';
import type { ExpenseSplit, GroupMember } from '@/types/group';

const members = (): GroupMember[] => [
  { id: 'u1', displayName: 'Alice', email: 'alice@test.com', imageUrl: null },
  { id: 'u2', displayName: 'Bob', email: 'bob@test.com', imageUrl: null },
  {
    id: 'u3',
    displayName: 'Charlie',
    email: 'charlie@test.com',
    imageUrl: null,
  },
];

describe('useExpenseSplit — initialization (no existing splits)', () => {
  it('defaults to EQUAL mode with all members selected', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);

    expect(split.splitMode.value).toBe('EQUAL');
    expect(split.selectedSplitUserIds.value).toEqual(['u1', 'u2', 'u3']);
    expect(split.percentValues.value).toEqual({});
    expect(split.fixedValues.value).toEqual({});
  });
});

describe('useExpenseSplit — initialization (from existing PERCENT splits)', () => {
  it('detects PERCENT mode and prefills percentValues from selected members only', () => {
    const membersRef = ref(members());
    const initialSplits: ExpenseSplit[] = [
      {
        userId: 'u1',
        displayName: 'Alice',
        shareType: 'PERCENT',
        shareValue: 60,
        computedAmount: 0,
      },
      {
        userId: 'u2',
        displayName: 'Bob',
        shareType: 'PERCENT',
        shareValue: 40,
        computedAmount: 0,
      },
    ];
    const split = useExpenseSplit(membersRef, initialSplits);

    expect(split.splitMode.value).toBe('PERCENT');
    expect(split.selectedSplitUserIds.value).toEqual(['u1', 'u2']);
    expect(split.percentValues.value).toEqual({ u1: 60, u2: 40 });
    expect(split.fixedValues.value).toEqual({});
  });
});

describe('useExpenseSplit — initialization (from existing FIXED splits)', () => {
  it('detects FIXED mode and prefills fixedValues', () => {
    const membersRef = ref(members());
    const initialSplits: ExpenseSplit[] = [
      {
        userId: 'u1',
        displayName: 'Alice',
        shareType: 'FIXED',
        shareValue: 12.5,
        computedAmount: 12.5,
      },
      {
        userId: 'u3',
        displayName: 'Charlie',
        shareType: 'FIXED',
        shareValue: 7.5,
        computedAmount: 7.5,
      },
    ];
    const split = useExpenseSplit(membersRef, initialSplits);

    expect(split.splitMode.value).toBe('FIXED');
    expect(split.selectedSplitUserIds.value).toEqual(['u1', 'u3']);
    expect(split.fixedValues.value).toEqual({ u1: 12.5, u3: 7.5 });
  });
});

describe('useExpenseSplit — percentSum / fixedSum', () => {
  it('percentSum sums only the currently selected users values', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.splitMode.value = 'PERCENT';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.percentValues.value = { u1: 30, u2: 25, u3: 999 };

    expect(split.percentSum.value).toBe(55);
  });

  it('fixedSum ignores non-numeric ("") entries', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.fixedValues.value = { u1: 10, u2: '' };

    expect(split.fixedSum.value).toBe(10);
  });
});

describe('useExpenseSplit — equalSplitPerPerson', () => {
  it('divides the amount evenly across selected users', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = ['u1', 'u2'];

    expect(split.equalSplitPerPerson(50)).toBe(25);
  });

  it('returns 0 for a non-positive amount', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);

    expect(split.equalSplitPerPerson(0)).toBe(0);
    expect(split.equalSplitPerPerson(-5)).toBe(0);
  });

  it('returns 0 when no users are selected', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = [];

    expect(split.equalSplitPerPerson(100)).toBe(0);
  });
});

describe('useExpenseSplit — isSplitValid', () => {
  it('EQUAL mode is valid whenever at least one user is selected', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);

    expect(split.isSplitValid(100)).toBe(true);
  });

  it('EQUAL mode is invalid with zero users selected', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = [];

    expect(split.isSplitValid(100)).toBe(false);
  });

  it('PERCENT mode requires the sum to be within 0.01 of 100', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.splitMode.value = 'PERCENT';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.percentValues.value = { u1: 60, u2: 40 };
    expect(split.isSplitValid(100)).toBe(true);

    split.percentValues.value = { u1: 60, u2: 30 };
    expect(split.isSplitValid(100)).toBe(false);
  });

  it('FIXED mode requires the sum to equal the amount and the amount to be positive', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.splitMode.value = 'FIXED';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.fixedValues.value = { u1: 30, u2: 20 };

    expect(split.isSplitValid(50)).toBe(true);
    expect(split.isSplitValid(0)).toBe(false);
    expect(split.isSplitValid(51)).toBe(false);
  });
});

describe('useExpenseSplit — splitErrorMessage', () => {
  it('returns the noMembersSelected message when nobody is selected', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef, undefined, {
      noMembersSelected: 'NO_MEMBERS_KEY',
      percentagesMustSum: (current) => `PERCENT_KEY:${current}`,
      fixedMustSum: (current, total) => `FIXED_KEY:${current}:${total}`,
    });
    split.selectedSplitUserIds.value = [];

    expect(split.splitErrorMessage(100)).toBe('NO_MEMBERS_KEY');
  });

  it('returns the percentagesMustSum message (built from the injected message fn) when off by more than 0.01', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef, undefined, {
      noMembersSelected: 'NO_MEMBERS_KEY',
      percentagesMustSum: (current) => `PERCENT_KEY:${current}`,
      fixedMustSum: (current, total) => `FIXED_KEY:${current}:${total}`,
    });
    split.splitMode.value = 'PERCENT';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.percentValues.value = { u1: 60, u2: 30 };

    expect(split.splitErrorMessage(100)).toBe('PERCENT_KEY:90.00');
  });

  it('returns the fixedMustSum message when the fixed sum does not match the amount', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef, undefined, {
      noMembersSelected: 'NO_MEMBERS_KEY',
      percentagesMustSum: (current) => `PERCENT_KEY:${current}`,
      fixedMustSum: (current, total) => `FIXED_KEY:${current}:${total}`,
    });
    split.splitMode.value = 'FIXED';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.fixedValues.value = { u1: 30, u2: 10 };

    expect(split.splitErrorMessage(50)).toBe('FIXED_KEY:40.00:50.00');
  });

  it('returns an empty string when the split is valid', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);

    expect(split.splitErrorMessage(100)).toBe('');
  });
});

describe('useExpenseSplit — toggleSplitUser', () => {
  it('removes a selected user and cleans up its value-map entries', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.splitMode.value = 'PERCENT';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.percentValues.value = { u1: 60, u2: 40 };

    split.toggleSplitUser('u1');

    expect(split.selectedSplitUserIds.value).toEqual(['u2']);
    expect(split.percentValues.value).toEqual({ u2: 40 });
  });

  it('adds a not-yet-selected user', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = ['u1'];

    split.toggleSplitUser('u2');

    expect(split.selectedSplitUserIds.value).toEqual(['u1', 'u2']);
  });
});

describe('useExpenseSplit — buildSplitPayload', () => {
  it('EQUAL mode: every selected user gets shareValue 0 / computedAmount 0', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = ['u1', 'u2'];

    expect(split.buildSplitPayload()).toEqual([
      {
        userId: 'u1',
        displayName: 'Alice',
        shareType: 'EQUAL',
        shareValue: 0,
        computedAmount: 0,
      },
      {
        userId: 'u2',
        displayName: 'Bob',
        shareType: 'EQUAL',
        shareValue: 0,
        computedAmount: 0,
      },
    ]);
  });

  it('PERCENT mode: shareValue reflects percentValues, computedAmount is 0 (computed server-side)', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.splitMode.value = 'PERCENT';
    split.selectedSplitUserIds.value = ['u1', 'u2'];
    split.percentValues.value = { u1: 60, u2: 40 };

    expect(split.buildSplitPayload()).toEqual([
      {
        userId: 'u1',
        displayName: 'Alice',
        shareType: 'PERCENT',
        shareValue: 60,
        computedAmount: 0,
      },
      {
        userId: 'u2',
        displayName: 'Bob',
        shareType: 'PERCENT',
        shareValue: 40,
        computedAmount: 0,
      },
    ]);
  });

  it('FIXED mode: shareValue and computedAmount both equal the fixed value', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.splitMode.value = 'FIXED';
    split.selectedSplitUserIds.value = ['u1', 'u3'];
    split.fixedValues.value = { u1: 12.5, u3: 7.5 };

    expect(split.buildSplitPayload()).toEqual([
      {
        userId: 'u1',
        displayName: 'Alice',
        shareType: 'FIXED',
        shareValue: 12.5,
        computedAmount: 12.5,
      },
      {
        userId: 'u3',
        displayName: 'Charlie',
        shareType: 'FIXED',
        shareValue: 7.5,
        computedAmount: 7.5,
      },
    ]);
  });

  it('resolves displayName to empty string for a userId no longer present in members', () => {
    const membersRef = ref(members());
    const split = useExpenseSplit(membersRef);
    split.selectedSplitUserIds.value = ['ghost-user'];

    expect(split.buildSplitPayload()).toEqual([
      {
        userId: 'ghost-user',
        displayName: '',
        shareType: 'EQUAL',
        shareValue: 0,
        computedAmount: 0,
      },
    ]);
  });
});

describe('useExpenseSplit — re-initialization when initialSplits changes (edit-modal reopen)', () => {
  it('re-derives state from a new initialSplits value via the watcher', async () => {
    const membersRef = ref(members());
    const initialSplits = ref<ExpenseSplit[]>([
      {
        userId: 'u1',
        displayName: 'Alice',
        shareType: 'FIXED',
        shareValue: 10,
        computedAmount: 10,
      },
    ]);
    const split = useExpenseSplit(membersRef, initialSplits.value);

    expect(split.splitMode.value).toBe('FIXED');
    expect(split.selectedSplitUserIds.value).toEqual(['u1']);

    // Mutate the same array reference in place (deep watch) to simulate the
    // edit modal being reopened with a different expense's splits.
    initialSplits.value.length = 0;
    initialSplits.value.push({
      userId: 'u2',
      displayName: 'Bob',
      shareType: 'PERCENT',
      shareValue: 100,
      computedAmount: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(split.splitMode.value).toBe('PERCENT');
    expect(split.selectedSplitUserIds.value).toEqual(['u2']);
    expect(split.percentValues.value).toEqual({ u2: 100 });
  });
});
