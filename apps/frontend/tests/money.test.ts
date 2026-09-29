import { describe, expect, it } from 'vitest';

import { hasStorablePrecision, MAX_AMOUNT } from '@/lib/money';

describe('hasStorablePrecision', () => {
  it.each([0.01, 0.1, 0.29, 1.15, 19.99, 1234.56, MAX_AMOUNT])('accepts %s', (value) => {
    expect(hasStorablePrecision(value)).toBe(true);
  });

  it.each([0.001, 10.005, 1.999, MAX_AMOUNT + 0.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    expect(hasStorablePrecision(value)).toBe(false);
  });
});
