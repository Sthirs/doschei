/**
 * Unit tests for `pushSubscriptionStore.ts`, mocking the TypeORM repository
 * directly since the module under test is a thin wrapper around it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { upsertMock, deleteMock, getRepositoryMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async () => ({})),
  deleteMock: vi.fn(async () => ({})),
  getRepositoryMock: vi.fn(),
}));

vi.mock('../../src/db/data-source', () => ({
  AppDataSource: { getRepository: getRepositoryMock },
}));

getRepositoryMock.mockReturnValue({
  upsert: upsertMock,
  delete: deleteMock,
});

import { deleteByEndpoint, upsertSubscription } from '../../src/services/push/pushSubscriptionStore';

describe('upsertSubscription', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('performs a single atomic upsert keyed on endpoint', async () => {
    await upsertSubscription('u1', 'https://push.example.com/x', 'p', 'a');

    expect(upsertMock).toHaveBeenCalledWith(
      { userId: 'u1', endpoint: 'https://push.example.com/x', p256dh: 'p', auth: 'a' },
      { conflictPaths: ['endpoint'] },
    );
  });

  // Regression: a prior `findOne`-then-`save` sequence let two concurrent
  // registrations of the same brand-new endpoint both pass the `findOne`
  // check, so the second `save` failed on the unique constraint and
  // surfaced as a 400 to a client that did nothing wrong. There is no
  // read-then-write step left to race now — both calls resolve on their own.
  it('lets two concurrent registrations of the same endpoint both complete', async () => {
    const [first, second] = await Promise.allSettled([
      upsertSubscription('u1', 'https://push.example.com/shared', 'p1', 'a1'),
      upsertSubscription('u2', 'https://push.example.com/shared', 'p2', 'a2'),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('fulfilled');
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });
});

describe('deleteByEndpoint', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Regression: pruning on a "gone" transport result used to delete by
  // `endpoint` alone, so a subscription re-registered (same endpoint, new
  // keys) between the failed send and this cleanup was deleted out from
  // under its new owner. Scoping the delete to the keys that were actually
  // dispatched means a mismatch (row already replaced) removes nothing.
  it('scopes the delete to the exact endpoint and keys that were dispatched', async () => {
    await deleteByEndpoint('https://push.example.com/x', 'p', 'a');

    expect(deleteMock).toHaveBeenCalledWith({
      endpoint: 'https://push.example.com/x',
      p256dh: 'p',
      auth: 'a',
    });
  });
});
