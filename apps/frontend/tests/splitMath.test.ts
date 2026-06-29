import { describe, it, expect } from 'vitest';

import { computeEqualFixedSplits, splitModeFromExistingSplits } from '@/lib/splitMath';
import type { ExpenseSplit } from '@/types/group';

describe('computeEqualFixedSplits', () => {
  it('splits 30.00 evenly across 3 users', () => {
    const result = computeEqualFixedSplits(3000, ['a', 'b', 'c']);
    expect(result).toEqual([
      { userId: 'a', shareValue: 10.0 },
      { userId: 'b', shareValue: 10.0 },
      { userId: 'c', shareValue: 10.0 },
    ]);
  });

  it('splits 10.00 unevenly across 3 users (remainder to first users)', () => {
    const result = computeEqualFixedSplits(1000, ['a', 'b', 'c']);
    expect(result).toEqual([
      { userId: 'a', shareValue: 3.34 },
      { userId: 'b', shareValue: 3.33 },
      { userId: 'c', shareValue: 3.33 },
    ]);
  });

  it('returns empty array for empty userIds', () => {
    const result = computeEqualFixedSplits(1000, []);
    expect(result).toEqual([]);
  });

  it('returns full amount for single user', () => {
    const result = computeEqualFixedSplits(2500, ['only']);
    expect(result).toEqual([{ userId: 'only', shareValue: 25.0 }]);
  });

  it('handles zero amount', () => {
    const result = computeEqualFixedSplits(0, ['a', 'b']);
    expect(result).toEqual([
      { userId: 'a', shareValue: 0 },
      { userId: 'b', shareValue: 0 },
    ]);
  });

  it('handles negative amount by treating as zero', () => {
    const result = computeEqualFixedSplits(-100, ['a', 'b']);
    expect(result).toEqual([
      { userId: 'a', shareValue: 0 },
      { userId: 'b', shareValue: 0 },
    ]);
  });

  it('distributes remainder cents to first users in order', () => {
    // 1.00 / 3 = 0.33, 0.33, 0.34 → remainder 1 cent goes to first user
    const result = computeEqualFixedSplits(100, ['x', 'y', 'z']);
    expect(result).toEqual([
      { userId: 'x', shareValue: 0.34 },
      { userId: 'y', shareValue: 0.33 },
      { userId: 'z', shareValue: 0.33 },
    ]);
  });
});

describe('splitModeFromExistingSplits', () => {
  it('returns EQUAL mode with empty selection for undefined splits', () => {
    const result = splitModeFromExistingSplits(undefined);
    expect(result.mode).toBe('EQUAL');
    expect(result.selectedUserIds).toEqual([]);
    expect(result.percentValues).toEqual({});
    expect(result.fixedValues).toEqual({});
  });

  it('returns EQUAL mode with empty selection for empty splits array', () => {
    const result = splitModeFromExistingSplits([]);
    expect(result.mode).toBe('EQUAL');
    expect(result.selectedUserIds).toEqual([]);
  });

  it('detects PERCENT mode and prefills percentValues', () => {
    const splits: ExpenseSplit[] = [
      { userId: 'a', displayName: 'Alice', shareType: 'PERCENT', shareValue: 60, computedAmount: 60 },
      { userId: 'b', displayName: 'Bob', shareType: 'PERCENT', shareValue: 40, computedAmount: 40 },
    ];
    const result = splitModeFromExistingSplits(splits);
    expect(result.mode).toBe('PERCENT');
    expect(result.selectedUserIds).toEqual(['a', 'b']);
    expect(result.percentValues).toEqual({ a: 60, b: 40 });
    expect(result.fixedValues).toEqual({});
  });

  it('detects FIXED mode and prefills fixedValues', () => {
    const splits: ExpenseSplit[] = [
      { userId: 'a', displayName: 'Alice', shareType: 'FIXED', shareValue: 15.5, computedAmount: 15.5 },
      { userId: 'b', displayName: 'Bob', shareType: 'FIXED', shareValue: 14.5, computedAmount: 14.5 },
    ];
    const result = splitModeFromExistingSplits(splits);
    expect(result.mode).toBe('FIXED');
    expect(result.selectedUserIds).toEqual(['a', 'b']);
    expect(result.fixedValues).toEqual({ a: 15.5, b: 14.5 });
    expect(result.percentValues).toEqual({});
  });

  it('falls back to FIXED mode for mixed share types', () => {
    const splits: ExpenseSplit[] = [
      { userId: 'a', displayName: 'Alice', shareType: 'PERCENT', shareValue: 50, computedAmount: 50 },
      { userId: 'b', displayName: 'Bob', shareType: 'FIXED', shareValue: 50, computedAmount: 50 },
    ];
    const result = splitModeFromExistingSplits(splits);
    expect(result.mode).toBe('FIXED');
    expect(result.selectedUserIds).toEqual(['a', 'b']);
  });

  it('detects EQUAL mode for splits with shareType EQUAL', () => {
    // EQUAL is not yet in the ShareType union; cast until T4 updates the type
    const splits = [
      { userId: 'a', displayName: 'Alice', shareType: 'EQUAL', shareValue: 50, computedAmount: 50 },
      { userId: 'b', displayName: 'Bob', shareType: 'EQUAL', shareValue: 50, computedAmount: 50 },
      { userId: 'c', displayName: 'Carol', shareType: 'EQUAL', shareValue: 50, computedAmount: 50 },
    ] as unknown as ExpenseSplit[];
    const result = splitModeFromExistingSplits(splits);
    expect(result.mode).toBe('EQUAL');
    expect(result.selectedUserIds).toEqual(['a', 'b', 'c']);
    expect(result.percentValues).toEqual({});
    expect(result.fixedValues).toEqual({});
  });

  it('detects EQUAL mode and returns empty percentValues/fixedValues', () => {
    const splits = [
      { userId: 'x', displayName: 'Xavier', shareType: 'EQUAL', shareValue: 25, computedAmount: 25 },
      { userId: 'y', displayName: 'Yvonne', shareType: 'EQUAL', shareValue: 25, computedAmount: 25 },
    ] as unknown as ExpenseSplit[];
    const result = splitModeFromExistingSplits(splits);
    expect(result.mode).toBe('EQUAL');
    expect(result.selectedUserIds).toEqual(['x', 'y']);
    expect(result.percentValues).toEqual({});
    expect(result.fixedValues).toEqual({});
  });
});
