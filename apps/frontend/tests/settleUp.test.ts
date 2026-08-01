import { describe, expect, it } from 'vitest';

import {
  computeSettleUpDefaults,
  outstandingWith,
  settlementAmountFor,
} from '@/lib/settleUp';
import type { BalanceSummary, GroupMember } from '@/types/group';

const member = (id: string, displayName: string): GroupMember => ({
  id,
  displayName,
  email: `${id}@example.com`,
});

const balance = (
  currentUserId: string,
  perUser: BalanceSummary['perUser'],
  netForCurrentUser?: number,
): BalanceSummary => ({
  currentUserId,
  currentUserName: 'Current',
  netForCurrentUser:
    netForCurrentUser ?? perUser.reduce((sum, p) => sum + p.netForCurrentUser, 0),
  perUser,
});

describe('outstandingWith', () => {
  it('returns the exact netForCurrentUser when the user is in perUser', () => {
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: -12.34 },
    ]);
    expect(outstandingWith(summary, 'u2')).toBe(-12.34);
  });

  it('returns 0 when the user is absent from perUser', () => {
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: 7.5 },
    ]);
    expect(outstandingWith(summary, 'u3')).toBe(0);
  });
});

describe('computeSettleUpDefaults', () => {
  it('picks the logged-in user as payer with amount = |net| when the logged-in user owes €10', () => {
    const members = [member('u1', 'Current'), member('u2', 'Alice')];
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: -10 },
    ]);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result).toEqual({ payerId: 'u1', payeeId: 'u2', amount: 10 });
  });

  it('picks the counterpart as payer with amount = net when the counterpart owes €10', () => {
    const members = [member('u1', 'Current'), member('u2', 'Alice')];
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: 10 },
    ]);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result).toEqual({ payerId: 'u2', payeeId: 'u1', amount: 10 });
  });

  it('returns payer = current user, payee = counterpart, amount = "" when all settled (net === 0)', () => {
    const members = [member('u1', 'Current'), member('u2', 'Alice')];
    const summary = balance('u1', []);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result).toEqual({ payerId: 'u1', payeeId: 'u2', amount: '' });
  });

  it('picks the candidate with the greatest |net| across three members', () => {
    const members = [
      member('u1', 'Current'),
      member('u2', 'Alice'),
      member('u3', 'Bob'),
    ];
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: -5 },
      { userId: 'u3', displayName: 'Bob', netForCurrentUser: -30 },
    ]);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result).toEqual({ payerId: 'u1', payeeId: 'u3', amount: 30 });
  });

  it('breaks ties by displayName.localeCompare for determinism', () => {
    const members = [
      member('u1', 'Current'),
      member('u2', 'Bob'),
      member('u3', 'Alice'),
    ];
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Bob', netForCurrentUser: -10 },
      { userId: 'u3', displayName: 'Alice', netForCurrentUser: 10 },
    ]);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    // 'Alice'.localeCompare('Bob', 'en') < 0 → Alice (u3) wins on tie
    expect(result).toEqual({ payerId: 'u3', payeeId: 'u1', amount: 10 });
  });

  it('treats a member missing from perUser as net 0 via outstandingWith', () => {
    const members = [
      member('u1', 'Current'),
      member('u2', 'Settled'),
      member('u3', 'Debtor'),
    ];
    // u2 is not in perUser (zero net, omitted by backend); u3 owes 7
    const summary = balance('u1', [
      { userId: 'u3', displayName: 'Debtor', netForCurrentUser: 7 },
    ]);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result).toEqual({ payerId: 'u3', payeeId: 'u1', amount: 7 });
  });

  it('returns payeeId = "" and amount = "" in a solo group (only the current user)', () => {
    const members = [member('u1', 'Current')];
    const summary = balance('u1', []);
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result).toEqual({ payerId: 'u1', payeeId: '', amount: '' });
  });

  it('rounds a non-2-decimal net (-10.005) to a clean 2-decimal amount without drift', () => {
    const members = [member('u1', 'Current'), member('u2', 'Other')];
    const summary = balance(
      'u1',
      [{ userId: 'u2', displayName: 'Other', netForCurrentUser: -10.005 }],
      -10.005,
    );
    const result = computeSettleUpDefaults(summary, members, 'u1');
    expect(result.payerId).toBe('u1');
    expect(result.payeeId).toBe('u2');
    expect(typeof result.amount).toBe('number');
    // 10.005 is stored as 10.00499999... in IEEE 754, so 10.005 * 100 lands
    // exactly on 1000.5 and Math.round rounds half-up to 1001 → 10.01.
    // The contract is "clean 2-decimal number, no extra FP digits".
    expect(result.amount).toBeCloseTo(10.01, 2);
    expect(Number((result.amount as number).toFixed(2))).toBe(result.amount);
  });
});

describe('settlementAmountFor', () => {
  it('returns |net| with the other party when exactly one of payer/payee is the current user', () => {
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: 15 },
    ]);
    // current user is the payee
    expect(settlementAmountFor(summary, 'u1', 'u2', 'u1')).toBe(15);
    // current user is the payer
    expect(settlementAmountFor(summary, 'u1', 'u1', 'u2')).toBe(15);
  });

  it('returns "" when both payer and payee are third parties (neither is the current user)', () => {
    const summary = balance('u1', [
      { userId: 'u2', displayName: 'Alice', netForCurrentUser: 15 },
      { userId: 'u3', displayName: 'Bob', netForCurrentUser: 15 },
    ]);
    expect(settlementAmountFor(summary, 'u1', 'u2', 'u3')).toBe('');
  });
});
