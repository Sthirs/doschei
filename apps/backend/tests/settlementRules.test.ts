import { describe, expect, it } from 'vitest';

import {
  buildSettlementSplit,
  validateSettlementInput,
  type SettlementInput,
} from '../src/services/settlementRules';

const MEMBER_IDS = ['u1', 'u2', 'u3'];

describe('validateSettlementInput', () => {
  it('accepts a valid input and returns trimmed ids', () => {
    const result = validateSettlementInput(
      {
        paidByUserId: '  u1  ',
        paidToUserId: '  u2  ',
        amount: 25,
        date: '2024-01-15',
      },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settlement).toEqual({
        paidByUserId: 'u1',
        paidToUserId: 'u2',
        amount: 25,
        date: '2024-01-15',
      });
    }
  });

  it('rejects when the payer and payee are the same person', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u1', amount: 10 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('The payer and the payee must be different people.');
    }
  });

  it('rejects when the payer is not a member of the group', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'not-a-member', paidToUserId: 'u2', amount: 10 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('The selected user is not a member of this group.');
    }
  });

  it('rejects when the payee is not a member of the group', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'not-a-member', amount: 10 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('The selected user is not a member of this group.');
    }
  });

  it('rejects a non-string paidByUserId', () => {
    const result = validateSettlementInput(
      { paidByUserId: 42, paidToUserId: 'u2', amount: 10 } as unknown as SettlementInput,
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('A payer and a payee are required.');
    }
  });

  it('rejects an empty paidToUserId', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: '', amount: 10 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('A payer and a payee are required.');
    }
  });

  it('rejects amount of 0', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: 0 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Settlement amount must be a positive number.');
    }
  });

  it('rejects a negative amount', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: -5 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Settlement amount must be a positive number.');
    }
  });

  it('rejects a string amount', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: '10' } as unknown as SettlementInput,
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Settlement amount must be a positive number.');
    }
  });

  it('rejects NaN amount', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: Number.NaN } as unknown as SettlementInput,
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Settlement amount must be a positive number.');
    }
  });

  it('rejects Infinity amount', () => {
    const result = validateSettlementInput(
      {
        paidByUserId: 'u1',
        paidToUserId: 'u2',
        amount: Number.POSITIVE_INFINITY,
      } as unknown as SettlementInput,
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Settlement amount must be a positive number.');
    }
  });

  it('rejects a missing amount', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2' } as unknown as SettlementInput,
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Settlement amount must be a positive number.');
    }
  });

  it('accepts input without a date (date is optional)', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: 10 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settlement).toEqual({
        paidByUserId: 'u1',
        paidToUserId: 'u2',
        amount: 10,
      });
    }
  });

  it('rejects a date that is not a real calendar day (2024-02-30)', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: 10, date: '2024-02-30' },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Valid settlement date is required.');
    }
  });

  it('rejects a date in the wrong format (15-01-2024)', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: 10, date: '15-01-2024' },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Valid settlement date is required.');
    }
  });

  it('accepts a valid YYYY-MM-DD date', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: 10, date: '2024-01-15' },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settlement.date).toBe('2024-01-15');
    }
  });

  it('accepts an overpayment-sized amount (Q5: overpayment allowed)', () => {
    const result = validateSettlementInput(
      { paidByUserId: 'u1', paidToUserId: 'u2', amount: 999999 },
      MEMBER_IDS,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settlement.amount).toBe(999999);
    }
  });
});

describe('buildSettlementSplit', () => {
  it('builds a FIXED split for the payee with the settlement amount as shareValue', () => {
    expect(buildSettlementSplit('u2', 30)).toEqual({
      userId: 'u2',
      shareType: 'FIXED',
      shareValue: 30,
    });
  });
});
