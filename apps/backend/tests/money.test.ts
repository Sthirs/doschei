import { describe, expect, it } from 'vitest';

import { isStorableMoneyAmount, MAX_MONEY_AMOUNT } from '../src/utils/money';

describe('isStorableMoneyAmount', () => {
  it.each([0.01, 0.1, 0.29, 1.15, 10, 19.99, 1234.56, MAX_MONEY_AMOUNT])(
    'accepts %s',
    (value) => {
      expect(isStorableMoneyAmount(value)).toBe(true);
    },
  );

  it.each([0, -1, 0.001, 10.005, 1.999, MAX_MONEY_AMOUNT + 0.01, 1e12, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s',
    (value) => {
      expect(isStorableMoneyAmount(value)).toBe(false);
    },
  );
});
