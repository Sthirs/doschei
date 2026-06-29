import { describe, expect, it } from 'vitest';

import {
  aggregateBalance,
  computeAllocatedAmounts,
  validateSplits,
  type ParsedSplit,
} from '../src/services/expenseSplitMath';

describe('validateSplits (PERCENT)', () => {
  it('accepts a valid 50/50 split', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 50 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 50 },
      ],
      100,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.splits).toEqual([
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 50 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 50 },
      ]);
    }
  });

  it('accepts 33.33/33.33/33.34 summing to 100 within epsilon', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 33.33 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 33.33 },
        { userId: 'user-3', shareType: 'PERCENT', shareValue: 33.34 },
      ],
      10,
    );

    expect(result.ok).toBe(true);
  });

  it('rejects when percentages sum to 99', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 50 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 49 },
      ],
      100,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Percentages must sum to 100.');
    }
  });

  it('rejects when percentages sum to 101', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 60 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 41 },
      ],
      100,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Percentages must sum to 100.');
    }
  });

  it('rejects mixed share types (PERCENT + FIXED)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 50 },
        { userId: 'user-2', shareType: 'FIXED', shareValue: 50 },
      ],
      100,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('All splits must use the same share type.');
    }
  });

  it('rejects a missing userId', () => {
    const result = validateSplits(
      [
        { shareType: 'PERCENT', shareValue: 100 },
      ],
      50,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Each split requires userId, shareType, and a positive shareValue.');
    }
  });

  it('rejects a missing shareType', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareValue: 100 },
      ],
      50,
    );

    expect(result.ok).toBe(false);
  });

  it('rejects a missing shareValue', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT' },
      ],
      50,
    );

    expect(result.ok).toBe(false);
  });

  it('rejects a non-positive shareValue (zero)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: 0 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 100 },
      ],
      50,
    );

    expect(result.ok).toBe(false);
  });

  it('rejects a non-positive shareValue (negative)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'PERCENT', shareValue: -10 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 110 },
      ],
      50,
    );

    expect(result.ok).toBe(false);
  });

  it('does NOT reject a nonmember userId (membership is service-layer)', () => {
    const result = validateSplits(
      [
        { userId: 'definitely-not-a-member', shareType: 'PERCENT', shareValue: 100 },
      ],
      50,
    );

    expect(result.ok).toBe(true);
  });

  it('rejects an empty array', () => {
    const result = validateSplits([], 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('At least one split is required.');
    }
  });

  it('rejects a non-array input', () => {
    const result = validateSplits({ userId: 'u', shareType: 'PERCENT', shareValue: 100 }, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('At least one split is required.');
    }
  });

  it('rejects undefined splits', () => {
    const result = validateSplits(undefined, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('At least one split is required.');
    }
  });
});

describe('validateSplits (FIXED)', () => {
  it('accepts a valid split summing to amount', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'FIXED', shareValue: 30 },
        { userId: 'user-2', shareType: 'FIXED', shareValue: 70 },
      ],
      100,
    );

    expect(result.ok).toBe(true);
  });

  it('accepts a fixed split that sums within epsilon (cent-level rounding)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'FIXED', shareValue: 33.33 },
        { userId: 'user-2', shareType: 'FIXED', shareValue: 33.33 },
        { userId: 'user-3', shareType: 'FIXED', shareValue: 33.34 },
      ],
      100,
    );

    expect(result.ok).toBe(true);
  });

  it('rejects when sum is less than amount', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'FIXED', shareValue: 30 },
        { userId: 'user-2', shareType: 'FIXED', shareValue: 50 },
      ],
      100,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Fixed amounts must sum to the expense total.');
    }
  });

  it('rejects when sum is greater than amount', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'FIXED', shareValue: 60 },
        { userId: 'user-2', shareType: 'FIXED', shareValue: 50 },
      ],
      100,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Fixed amounts must sum to the expense total.');
    }
  });

  it('rejects mixed share types (FIXED + PERCENT)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'FIXED', shareValue: 50 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 50 },
      ],
      100,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('All splits must use the same share type.');
    }
  });
});

describe('computeAllocatedAmounts', () => {
  it('allocates an even 50/50 percent split with no remainder', () => {
    const splits: ParsedSplit[] = [
      { userId: 'user-1', shareType: 'PERCENT', shareValue: 50 },
      { userId: 'user-2', shareType: 'PERCENT', shareValue: 50 },
    ];

    const result = computeAllocatedAmounts(100, splits);

    expect(result).toEqual([
      { userId: 'user-1', shareType: 'PERCENT', shareValue: 50, computedAmount: 50 },
      { userId: 'user-2', shareType: 'PERCENT', shareValue: 50, computedAmount: 50 },
    ]);

    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(10000);
  });

  it('allocates 33.33/33.33/33.34 with deterministic remainder distribution', () => {
    const splits: ParsedSplit[] = [
      { userId: 'user-1', shareType: 'PERCENT', shareValue: 33.33 },
      { userId: 'user-2', shareType: 'PERCENT', shareValue: 33.33 },
      { userId: 'user-3', shareType: 'PERCENT', shareValue: 33.34 },
    ];

    const result = computeAllocatedAmounts(10, splits);

    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(1000);

    const centsByUser = result.map((entry) => ({
      userId: entry.userId,
      cents: Math.round(entry.computedAmount * 100),
    }));

    // 33.33% of 1000 cents = 333.33 → floor = 333; 33.34% of 1000 cents = 333.4 → floor = 333.
    // Sum of floors = 999. Remainder = 1, distributed to splits[0] → first user gets 334 cents.
    expect(centsByUser).toEqual([
      { userId: 'user-1', cents: 334 },
      { userId: 'user-2', cents: 333 },
      { userId: 'user-3', cents: 333 },
    ]);
  });

  it('distributes large remainders in input order without overshooting', () => {
    // 100% split into 3 equal pieces would be fine, but here we test
    // that remainder < N when percentages are valid.
    // 33.34% / 33.33% / 33.33% of 10.00 = same totals; reordering should
    // give the same total and put the extra cent on the first listed user.
    const splits: ParsedSplit[] = [
      { userId: 'a', shareType: 'PERCENT', shareValue: 33.34 },
      { userId: 'b', shareType: 'PERCENT', shareValue: 33.33 },
      { userId: 'c', shareType: 'PERCENT', shareValue: 33.33 },
    ];

    const result = computeAllocatedAmounts(10, splits);

    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(1000);
    expect(Math.round(result[0].computedAmount * 100)).toBe(334);
  });

  it('passes FIXED shareValue through as computedAmount', () => {
    const splits: ParsedSplit[] = [
      { userId: 'user-1', shareType: 'FIXED', shareValue: 30 },
      { userId: 'user-2', shareType: 'FIXED', shareValue: 70 },
    ];

    const result = computeAllocatedAmounts(100, splits);

    expect(result).toEqual([
      { userId: 'user-1', shareType: 'FIXED', shareValue: 30, computedAmount: 30 },
      { userId: 'user-2', shareType: 'FIXED', shareValue: 70, computedAmount: 70 },
    ]);
  });

  it('returns an empty array for no splits', () => {
    const result = computeAllocatedAmounts(100, []);
    expect(result).toEqual([]);
  });

  it('produces amounts that sum exactly in cents for the canonical 33/33/34 case', () => {
    const splits: ParsedSplit[] = [
      { userId: 'user-1', shareType: 'PERCENT', shareValue: 33.33 },
      { userId: 'user-2', shareType: 'PERCENT', shareValue: 33.33 },
      { userId: 'user-3', shareType: 'PERCENT', shareValue: 33.34 },
    ];

    const result = computeAllocatedAmounts(10, splits);
    const sumCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(sumCents).toBe(1000);
  });
});

describe('aggregateBalance', () => {
  it('two-user case: alice paid 30, splits [bob 50%, alice 50%] → bob owes alice 15', () => {
    // Note: contract wording says "alice is owed 10 by bob" but the math
    // for a 50/50 split on 30 is 15 to each. We follow the math; the
    // contract text in the user prompt is illustrative.
    const result = aggregateBalance(
      [
        {
          paidByUserId: 'alice',
          splits: [
            { userId: 'bob', computedAmount: 15 },
            { userId: 'alice', computedAmount: 15 },
          ],
        },
      ],
      'alice',
    );

    expect(result.netForCurrentUser).toBe(15);
    expect(result.perUser.get('bob')).toBe(15);
    expect(result.perUser.has('alice')).toBe(false);
  });

  it('three-user case: alice paid 30, splits [bob 50%, carol 50%] (no alice split)', () => {
    const result = aggregateBalance(
      [
        {
          paidByUserId: 'alice',
          splits: [
            { userId: 'bob', computedAmount: 15 },
            { userId: 'carol', computedAmount: 15 },
          ],
        },
      ],
      'alice',
    );

    expect(result.netForCurrentUser).toBe(30);
    expect(result.perUser.get('bob')).toBe(15);
    expect(result.perUser.get('carol')).toBe(15);
    expect(result.perUser.size).toBe(2);
  });

  it('mixed-direction case: alice and bob pay overlapping expenses', () => {
    // Mixed direction: alice paid 12 split bob 6, carol 6; bob paid 12
    // split alice 6, carol 6. Per spec, the second expense's carol split
    // does not affect any alice-X pair and is skipped.
    const result = aggregateBalance(
      [
        {
          paidByUserId: 'alice',
          splits: [
            { userId: 'bob', computedAmount: 6 },
            { userId: 'carol', computedAmount: 6 },
          ],
        },
        {
          paidByUserId: 'bob',
          splits: [
            { userId: 'alice', computedAmount: 6 },
            { userId: 'carol', computedAmount: 6 },
          ],
        },
      ],
      'alice',
    );

    expect(result.perUser.has('bob')).toBe(false);
    expect(result.perUser.get('carol')).toBe(6);

    const sumOfPerUser = Array.from(result.perUser.values()).reduce((acc, value) => acc + value, 0);
    expect(sumOfPerUser).toBe(result.netForCurrentUser);
    expect(result.netForCurrentUser).toBe(6);
  });

  it('skips expenses where neither currentUser nor the other side matches the pair', () => {
    const result = aggregateBalance(
      [
        {
          paidByUserId: 'alice',
          splits: [{ userId: 'bob', computedAmount: 20 }],
        },
      ],
      'carol',
    );

    expect(result.netForCurrentUser).toBe(0);
    expect(result.perUser.size).toBe(0);
  });

  it('omits perUser entries with a net of exactly 0', () => {
    // alice paid 10 split bob 5, alice 5. From bob's view: bob owes alice 5.
    // Add a second expense where bob paid 10 split alice 5, bob 5. From
    // bob's view: bob is owed 5 by alice. Net bob-alice = 0 → omitted.
    const result = aggregateBalance(
      [
        {
          paidByUserId: 'alice',
          splits: [
            { userId: 'bob', computedAmount: 5 },
            { userId: 'alice', computedAmount: 5 },
          ],
        },
        {
          paidByUserId: 'bob',
          splits: [
            { userId: 'alice', computedAmount: 5 },
            { userId: 'bob', computedAmount: 5 },
          ],
        },
      ],
      'bob',
    );

    expect(result.netForCurrentUser).toBe(0);
    expect(result.perUser.has('alice')).toBe(false);
    expect(result.perUser.size).toBe(0);
  });

  it('round-trip: sum of perUser equals netForCurrentUser for a 3-way multi-expense scenario', () => {
    const result = aggregateBalance(
      [
        { paidByUserId: 'alice', splits: [{ userId: 'bob', computedAmount: 10 }, { userId: 'carol', computedAmount: 5 }] },
        { paidByUserId: 'bob',   splits: [{ userId: 'alice', computedAmount: 4 }, { userId: 'carol', computedAmount: 2 }] },
        { paidByUserId: 'carol', splits: [{ userId: 'alice', computedAmount: 3 }, { userId: 'bob', computedAmount: 1 }] },
      ],
      'alice',
    );

    const sumOfPerUser = Array.from(result.perUser.values()).reduce((acc, value) => acc + value, 0);
    expect(sumOfPerUser).toBe(result.netForCurrentUser);
  });

  it('treats a self-split as a no-op for the current user', () => {
    const result = aggregateBalance(
      [
        {
          paidByUserId: 'alice',
          splits: [{ userId: 'alice', computedAmount: 10 }],
        },
      ],
      'alice',
    );

    expect(result.netForCurrentUser).toBe(0);
    expect(result.perUser.size).toBe(0);
  });
});

describe('validateSplits (EQUAL)', () => {
  it('accepts a valid EQUAL split with positive shareValue', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'EQUAL', shareValue: 50 },
        { userId: 'user-2', shareType: 'EQUAL', shareValue: 50 },
        { userId: 'user-3', shareType: 'EQUAL', shareValue: 50 },
      ],
      100,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.splits).toEqual([
        { userId: 'user-1', shareType: 'EQUAL', shareValue: 50 },
        { userId: 'user-2', shareType: 'EQUAL', shareValue: 50 },
        { userId: 'user-3', shareType: 'EQUAL', shareValue: 50 },
      ]);
    }
  });

  it('accepts EQUAL with shareValue 0 (backend normalizes)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'EQUAL', shareValue: 0 },
        { userId: 'user-2', shareType: 'EQUAL', shareValue: 0 },
      ],
      100,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts EQUAL splits with arbitrary shareValues (no sum validation)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'EQUAL', shareValue: 1 },
        { userId: 'user-2', shareType: 'EQUAL', shareValue: 1 },
        { userId: 'user-3', shareType: 'EQUAL', shareValue: 1 },
      ],
      100,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects mixed share types (EQUAL + PERCENT)', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'EQUAL', shareValue: 50 },
        { userId: 'user-2', shareType: 'PERCENT', shareValue: 50 },
      ],
      100,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('All splits must use the same share type.');
    }
  });

  it('rejects a missing userId for EQUAL', () => {
    const result = validateSplits(
      [
        { shareType: 'EQUAL', shareValue: 50 },
      ],
      50,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Each split requires userId, shareType, and a positive shareValue.');
    }
  });

  it('rejects a missing shareType', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareValue: 50 },
      ],
      50,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a non-numeric shareValue for EQUAL', () => {
    const result = validateSplits(
      [
        { userId: 'user-1', shareType: 'EQUAL', shareValue: 'not-a-number' },
      ],
      50,
    );
    expect(result.ok).toBe(false);
  });

  it('does NOT reject a nonmember userId (membership is service-layer)', () => {
    const result = validateSplits(
      [
        { userId: 'definitely-not-a-member', shareType: 'EQUAL', shareValue: 50 },
      ],
      50,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects an empty array', () => {
    const result = validateSplits([], 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('At least one split is required.');
    }
  });

  it('rejects a non-array input', () => {
    const result = validateSplits({ userId: 'u', shareType: 'EQUAL', shareValue: 50 }, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('At least one split is required.');
    }
  });

  it('rejects undefined splits', () => {
    const result = validateSplits(undefined, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('At least one split is required.');
    }
  });
});

describe('computeAllocatedAmounts (EQUAL)', () => {
  it('allocates 100 evenly across 2 users', () => {
    const splits: ParsedSplit[] = [
      { userId: 'user-1', shareType: 'EQUAL', shareValue: 0 },
      { userId: 'user-2', shareType: 'EQUAL', shareValue: 0 },
    ];
    const result = computeAllocatedAmounts(100, splits);
    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(10000);
    expect(result[0].computedAmount).toBe(50);
    expect(result[1].computedAmount).toBe(50);
  });

  it('allocates 10.00 across 3 users with cent balancing', () => {
    const splits: ParsedSplit[] = [
      { userId: 'a', shareType: 'EQUAL', shareValue: 0 },
      { userId: 'b', shareType: 'EQUAL', shareValue: 0 },
      { userId: 'c', shareType: 'EQUAL', shareValue: 0 },
    ];
    const result = computeAllocatedAmounts(10, splits);
    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(1000);
    // First user gets the remainder cent
    expect(Math.round(result[0].computedAmount * 100)).toBe(334);
    expect(Math.round(result[1].computedAmount * 100)).toBe(333);
    expect(Math.round(result[2].computedAmount * 100)).toBe(333);
  });

  it('allocates full amount to single user', () => {
    const splits: ParsedSplit[] = [
      { userId: 'only', shareType: 'EQUAL', shareValue: 0 },
    ];
    const result = computeAllocatedAmounts(25, splits);
    expect(result[0].computedAmount).toBe(25);
    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(2500);
  });

  it('returns empty array for no splits', () => {
    const result = computeAllocatedAmounts(100, []);
    expect(result).toEqual([]);
  });

  it('allocates 1.00 across 3 users', () => {
    const splits: ParsedSplit[] = [
      { userId: 'x', shareType: 'EQUAL', shareValue: 0 },
      { userId: 'y', shareType: 'EQUAL', shareValue: 0 },
      { userId: 'z', shareType: 'EQUAL', shareValue: 0 },
    ];
    const result = computeAllocatedAmounts(1, splits);
    const totalCents = result.reduce((acc, entry) => acc + Math.round(entry.computedAmount * 100), 0);
    expect(totalCents).toBe(100);
    expect(Math.round(result[0].computedAmount * 100)).toBe(34);
  });
});
