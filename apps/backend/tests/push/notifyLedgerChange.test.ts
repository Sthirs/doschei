/**
 * Unit tests for the recipient-resolution rule in `notifyLedgerChange.ts`
 * (docs/specifications.md §Product Decisions): payer ∪ split members, minus
 * the actor. `dispatchNotification` is mocked so these tests assert only on
 * recipient resolution, not on delivery.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/push/pushDispatch', () => ({
  dispatchNotification: vi.fn(async () => undefined),
}));

import { dispatchNotification } from '../../src/services/push/pushDispatch';
import { notifyLedgerChange } from '../../src/services/push/notifyLedgerChange';

const dispatchNotificationMock = vi.mocked(dispatchNotification);

const baseInput = {
  kind: 'expense.created' as const,
  groupId: 'g1',
  groupName: 'Trip to Rome',
  actor: { id: 'actor', displayName: 'Actor' },
  description: 'Dinner',
  amount: 42.5,
};

describe('notifyLedgerChange', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('notifies the payer and every split member except the actor', async () => {
    await notifyLedgerChange({
      ...baseInput,
      paidBy: { id: 'payer' },
      splitUsers: [{ id: 'payer' }, { id: 'member1' }, { id: 'member2' }],
    });

    expect(dispatchNotificationMock).toHaveBeenCalledTimes(1);
    const [recipientIds] = dispatchNotificationMock.mock.calls[0];
    expect(new Set(recipientIds)).toEqual(
      new Set(['payer', 'member1', 'member2']),
    );
  });

  it('excludes the actor even when the actor paid or is in the split', async () => {
    await notifyLedgerChange({
      ...baseInput,
      actor: { id: 'actor', displayName: 'Actor' },
      paidBy: { id: 'actor' },
      splitUsers: [{ id: 'actor' }, { id: 'member1' }],
    });

    const [recipientIds] = dispatchNotificationMock.mock.calls[0];
    expect(recipientIds).toEqual(['member1']);
  });

  it('resolves exactly payer + payee for a settlement (no special case needed)', async () => {
    await notifyLedgerChange({
      ...baseInput,
      kind: 'settlement.created',
      paidBy: { id: 'payer' },
      splitUsers: [{ id: 'payee' }],
    });

    const [recipientIds] = dispatchNotificationMock.mock.calls[0];
    expect(new Set(recipientIds)).toEqual(new Set(['payer', 'payee']));
  });

  it('does not dispatch when the only affected party is the actor', async () => {
    await notifyLedgerChange({
      ...baseInput,
      actor: { id: 'actor', displayName: 'Actor' },
      paidBy: { id: 'actor' },
      splitUsers: [{ id: 'actor' }],
    });

    expect(dispatchNotificationMock).not.toHaveBeenCalled();
  });

  it('passes the deep-link URL and rendering params through', async () => {
    await notifyLedgerChange({
      ...baseInput,
      paidBy: { id: 'payer' },
      splitUsers: [{ id: 'member1' }],
    });

    const [, kind, params] = dispatchNotificationMock.mock.calls[0];
    expect(kind).toBe('expense.created');
    expect(params).toMatchObject({
      actorName: 'Actor',
      groupName: 'Trip to Rome',
      description: 'Dinner',
      amount: 42.5,
      url: '/groups/g1',
    });
  });
});
