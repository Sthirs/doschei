/**
 * Unit tests for `dispatchNotification` (ADR-0025 §5): must never throw or
 * reject regardless of what the transport does, must fan out to every
 * subscription of the given users, must render once per distinct recipient
 * language, and must prune a subscription on a 'gone' result.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: { pushEnabled: true },
}));

vi.mock('../../src/config/env', () => ({ env: envMock }));

const { findByMock } = vi.hoisted(() => ({ findByMock: vi.fn() }));
vi.mock('../../src/db/data-source', () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({ findBy: findByMock })),
  },
}));

vi.mock('../../src/services/push/pushSubscriptionStore', () => ({
  listByUserIds: vi.fn(),
  deleteByEndpoint: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/push/webPushClient', () => ({
  sendToSubscription: vi.fn(),
}));

import { deleteByEndpoint, listByUserIds } from '../../src/services/push/pushSubscriptionStore';
import { sendToSubscription } from '../../src/services/push/webPushClient';
import { dispatchNotification } from '../../src/services/push/pushDispatch';

const listByUserIdsMock = vi.mocked(listByUserIds);
const deleteByEndpointMock = vi.mocked(deleteByEndpoint);
const sendToSubscriptionMock = vi.mocked(sendToSubscription);

const params = {
  actorName: 'Alice',
  groupName: 'Trip to Rome',
  description: 'Dinner',
  amount: 10,
  url: '/groups/g1',
};

describe('dispatchNotification', () => {
  afterEach(() => {
    vi.clearAllMocks();
    envMock.pushEnabled = true;
  });

  it('is a no-op when push is disabled', async () => {
    envMock.pushEnabled = false;

    await dispatchNotification(['u1'], 'expense.created', params);

    expect(listByUserIdsMock).not.toHaveBeenCalled();
    expect(sendToSubscriptionMock).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no recipients', async () => {
    await dispatchNotification([], 'expense.created', params);

    expect(listByUserIdsMock).not.toHaveBeenCalled();
  });

  it('sends to every subscription of the given users', async () => {
    findByMock.mockResolvedValue([
      { id: 'u1', language: 'en' },
      { id: 'u2', language: 'it' },
    ]);
    listByUserIdsMock.mockResolvedValue([
      { userId: 'u1', endpoint: 'e1', p256dh: 'p1', auth: 'a1' } as never,
      { userId: 'u2', endpoint: 'e2', p256dh: 'p2', auth: 'a2' } as never,
    ]);
    sendToSubscriptionMock.mockResolvedValue('sent');

    await dispatchNotification(['u1', 'u2'], 'expense.created', params);

    expect(sendToSubscriptionMock).toHaveBeenCalledTimes(2);
    expect(deleteByEndpointMock).not.toHaveBeenCalled();
  });

  it('renders the payload once per distinct recipient language', async () => {
    findByMock.mockResolvedValue([
      { id: 'u1', language: 'en' },
      { id: 'u2', language: 'en' },
      { id: 'u3', language: 'it' },
    ]);
    listByUserIdsMock.mockResolvedValue([
      { userId: 'u1', endpoint: 'e1', p256dh: 'p', auth: 'a' } as never,
      { userId: 'u2', endpoint: 'e2', p256dh: 'p', auth: 'a' } as never,
      { userId: 'u3', endpoint: 'e3', p256dh: 'p', auth: 'a' } as never,
    ]);
    sendToSubscriptionMock.mockResolvedValue('sent');

    await dispatchNotification(['u1', 'u2', 'u3'], 'expense.created', params);

    const payloads = sendToSubscriptionMock.mock.calls.map((call) => call[1]);
    expect(new Set(payloads).size).toBe(2);
  });

  it('deletes the subscription when the transport reports "gone"', async () => {
    findByMock.mockResolvedValue([{ id: 'u1', language: 'en' }]);
    listByUserIdsMock.mockResolvedValue([
      { userId: 'u1', endpoint: 'dead-endpoint', p256dh: 'p', auth: 'a' } as never,
    ]);
    sendToSubscriptionMock.mockResolvedValue('gone');

    await dispatchNotification(['u1'], 'expense.created', params);

    expect(deleteByEndpointMock).toHaveBeenCalledWith('dead-endpoint');
  });

  it('swallows a throwing transport instead of rejecting', async () => {
    findByMock.mockResolvedValue([{ id: 'u1', language: 'en' }]);
    listByUserIdsMock.mockResolvedValue([
      { userId: 'u1', endpoint: 'e1', p256dh: 'p', auth: 'a' } as never,
    ]);
    sendToSubscriptionMock.mockRejectedValue(new Error('network error'));

    await expect(
      dispatchNotification(['u1'], 'expense.created', params),
    ).resolves.toBeUndefined();
  });

  it('swallows a failing repository lookup instead of rejecting', async () => {
    findByMock.mockRejectedValue(new Error('db down'));
    listByUserIdsMock.mockResolvedValue([]);

    await expect(
      dispatchNotification(['u1'], 'expense.created', params),
    ).resolves.toBeUndefined();
  });
});
