import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

import { PREFETCH_LIMIT, useGroupDataStore } from '@/stores/groupData';
import { api } from '@/lib/api';
import type { GroupDetail, GroupsListResponse } from '@/types/group';
import { deferred, httpError } from './helpers/groupDataCache';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

const get = api.get as unknown as ReturnType<typeof vi.fn>;

const makeDetail = (id: string, overrides: Partial<GroupDetail> = {}) =>
  ({
    id,
    name: `Group ${id}`,
    imageUrl: null,
    memberCount: 1,
    members: [],
    netForCurrentUser: 0,
    expenses: [],
    balance: {
      currentUserId: 'u1',
      currentUserName: 'Alice',
      netForCurrentUser: 0,
      perUser: [],
    },
    ...overrides,
  }) as GroupDetail;

const makeList = (ids: string[]): GroupsListResponse => ({
  groups: ids.map((id) => {
    const { expenses: _e, balance: _b, ...group } = makeDetail(id);
    return group;
  }),
  invitations: [],
});

const detailResponse = (group: GroupDetail) => ({ data: { group } });

/** Route GETs by URL to per-call deferreds so tests control settle order. */
const queueGets = () => {
  const pending: Array<{ url: string; d: ReturnType<typeof deferred<unknown>> }> = [];
  get.mockImplementation((url: string) => {
    const d = deferred<unknown>();
    pending.push({ url, d });
    return d.promise;
  });
  return pending;
};

const detailCalls = (id: string) =>
  get.mock.calls.filter(([url]) => url === `/groups/${id}`).length;

describe('useGroupDataStore (ADR-0030)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    get.mockReset();
  });

  describe('reads / stale-while-revalidate', () => {
    it('cold fetchDetail sets isFetching, then stores data and clears stale/error', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();

      const result = store.fetchDetail('g1');
      expect(store.details.g1.isFetching).toBe(true);
      expect(store.details.g1.data).toBeNull();

      pending[0].d.resolve(detailResponse(makeDetail('g1')));
      await expect(result).resolves.toMatchObject({ id: 'g1' });

      const entry = store.details.g1;
      expect(entry.isFetching).toBe(false);
      expect(entry.data?.name).toBe('Group g1');
      expect(entry.stale).toBe(false);
      expect(entry.error).toBe(false);
      expect(get).toHaveBeenCalledWith('/groups/g1');
    });

    it('warm fetchDetail keeps cached data visible synchronously and still revalidates', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1', { name: 'Old' })));
      const store = useGroupDataStore();
      await store.fetchDetail('g1');

      const pending = queueGets();
      void store.fetchDetail('g1');

      // Before the background request settles the old data is still there.
      expect(store.details.g1.data?.name).toBe('Old');
      expect(store.details.g1.isFetching).toBe(true);
      expect(pending).toHaveLength(1);

      pending[0].d.resolve(detailResponse(makeDetail('g1', { name: 'New' })));
      await flushPromises();
      expect(store.details.g1.data?.name).toBe('New');
    });

    it('cold fetchList stores groups and defaults missing invitations to []', async () => {
      get.mockResolvedValueOnce({ data: { groups: makeList(['a']).groups } });
      const store = useGroupDataStore();

      await store.fetchList();

      expect(get).toHaveBeenCalledWith('/groups');
      expect(store.list.data?.groups.map((g) => g.id)).toEqual(['a']);
      expect(store.list.data?.invitations).toEqual([]);
      expect(store.list.isFetching).toBe(false);
    });

    it('warm fetchList keeps the old list while revalidating', async () => {
      get.mockResolvedValueOnce({ data: makeList(['a']) });
      const store = useGroupDataStore();
      await store.fetchList();

      const pending = queueGets();
      void store.fetchList();
      expect(store.list.data?.groups).toHaveLength(1);
      expect(store.list.isFetching).toBe(true);

      pending[0].d.resolve({ data: makeList(['a', 'b']) });
      await flushPromises();
      expect(store.list.data?.groups).toHaveLength(2);
    });

    it('keys are independent: fetching g1 touches neither g2 nor the list', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();

      await store.fetchDetail('g1');

      expect(store.details.g2).toBeUndefined();
      expect(store.list.data).toBeNull();
      expect(store.list.isFetching).toBe(false);
    });

    it('cachedDetail returns the cached group or null', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();
      expect(store.cachedDetail('g1')).toBeNull();
      await store.fetchDetail('g1');
      expect(store.cachedDetail('g1')?.id).toBe('g1');
    });

    it('freshDetail returns the group only while it is neither stale nor errored', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();
      expect(store.freshDetail('g1')).toBeNull();
      await store.fetchDetail('g1');
      expect(store.freshDetail('g1')?.id).toBe('g1');

      store.invalidateGroup('g1');
      expect(store.cachedDetail('g1')?.id).toBe('g1');
      expect(store.freshDetail('g1')).toBeNull();

      get.mockRejectedValueOnce(new Error('network'));
      await store.fetchDetail('g1');
      expect(store.details.g1.error).toBe(true);
      expect(store.cachedDetail('g1')?.id).toBe('g1');
      expect(store.freshDetail('g1')).toBeNull();
    });
  });

  describe('in-flight deduplication', () => {
    it('two concurrent fetchDetail calls share one request', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();

      const a = store.fetchDetail('g1');
      const b = store.fetchDetail('g1');
      expect(get).toHaveBeenCalledTimes(1);

      pending[0].d.resolve(detailResponse(makeDetail('g1')));
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra).toBe(rb);
      expect(ra?.id).toBe('g1');
    });

    it('concurrent list reads share one request; list and detail do not', () => {
      queueGets();
      const store = useGroupDataStore();

      void store.fetchList();
      void store.fetchList();
      expect(get).toHaveBeenCalledTimes(1);

      void store.fetchDetail('g1');
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('a settled request is not memoised: the next read issues a new GET', async () => {
      get.mockResolvedValue(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();

      await store.fetchDetail('g1');
      await store.fetchDetail('g1');

      expect(get).toHaveBeenCalledTimes(2);
    });

    it('a rejected in-flight request is cleared so the next read retries', async () => {
      get.mockRejectedValueOnce(new Error('offline'));
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();

      await expect(store.fetchDetail('g1')).resolves.toBeNull();
      await expect(store.fetchDetail('g1')).resolves.toMatchObject({ id: 'g1' });
      expect(get).toHaveBeenCalledTimes(2);
      expect(store.details.g1.error).toBe(false);
    });
  });

  describe('invalidation and race guard', () => {
    it('invalidateGroup marks that detail and the list stale and bumps both versions', async () => {
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === '/groups'
            ? { data: makeList(['g1', 'g2']) }
            : detailResponse(makeDetail(url.split('/')[2])),
        ),
      );
      const store = useGroupDataStore();
      await Promise.all([
        store.fetchList(),
        store.fetchDetail('g1'),
        store.fetchDetail('g2'),
      ]);

      store.invalidateGroup('g1');

      expect(store.details.g1.stale).toBe(true);
      expect(store.details.g1.version).toBe(1);
      expect(store.list.stale).toBe(true);
      expect(store.list.version).toBe(1);
      expect(store.details.g2.stale).toBe(false);
      expect(store.details.g2.version).toBe(0);
    });

    it('invalidateList marks only the list; invalidateAll marks everything', async () => {
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === '/groups'
            ? { data: makeList(['g1']) }
            : detailResponse(makeDetail(url.split('/')[2])),
        ),
      );
      const store = useGroupDataStore();
      await Promise.all([store.fetchList(), store.fetchDetail('g1'), store.fetchDetail('g2')]);

      store.invalidateList();
      expect(store.list.stale).toBe(true);
      expect(store.details.g1.stale).toBe(false);

      store.invalidateAll();
      expect(store.details.g1.stale).toBe(true);
      expect(store.details.g2.stale).toBe(true);
      expect(store.list.version).toBe(2);
    });

    it('a read after an invalidation never joins the pre-invalidation request', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();

      // e.g. a list-triggered prefetch is in flight...
      void store.fetchDetail('g1');
      // ...the user saves an expense...
      store.invalidateGroup('g1');
      // ...and the detail view reads on the way back.
      void store.fetchDetail('g1');

      expect(detailCalls('g1')).toBe(2);

      // The old response lands first: data updates but the entry stays stale.
      pending[0].d.resolve(detailResponse(makeDetail('g1', { name: 'Before save' })));
      await flushPromises();
      expect(store.details.g1.data?.name).toBe('Before save');
      expect(store.details.g1.stale).toBe(true);
      expect(store.details.g1.isFetching).toBe(true);

      // The post-save response clears staleness.
      pending[1].d.resolve(detailResponse(makeDetail('g1', { name: 'After save' })));
      await flushPromises();
      expect(store.details.g1.data?.name).toBe('After save');
      expect(store.details.g1.stale).toBe(false);
      expect(store.details.g1.isFetching).toBe(false);
    });

    it('out-of-order responses: an older response never overwrites a newer one', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();

      void store.fetchDetail('g1');
      store.invalidateGroup('g1');
      void store.fetchDetail('g1');

      pending[1].d.resolve(detailResponse(makeDetail('g1', { name: 'Newer' })));
      await flushPromises();
      pending[0].d.resolve(detailResponse(makeDetail('g1', { name: 'Older' })));
      await flushPromises();

      expect(store.details.g1.data?.name).toBe('Newer');
      expect(store.details.g1.stale).toBe(false);
    });

    it('an older failure does not flag an error over newer data', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();

      void store.fetchDetail('g1');
      store.invalidateGroup('g1');
      void store.fetchDetail('g1');

      pending[1].d.resolve(detailResponse(makeDetail('g1')));
      await flushPromises();
      pending[0].d.reject(new Error('late failure'));
      await flushPromises();

      expect(store.details.g1.error).toBe(false);
      expect(store.details.g1.data).not.toBeNull();
    });

    it('an older success landing after a newer failure keeps the error (and the newer state)', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1', { name: 'Cached' })));
      const store = useGroupDataStore();
      await store.fetchDetail('g1');
      const pending = queueGets();

      void store.fetchDetail('g1'); // e.g. the mount revalidation, slow
      store.invalidateGroup('g1'); // app comes back to the foreground
      void store.fetchDetail('g1'); // the focus refetch, which fails fast

      pending[1].d.reject(httpError(500));
      await flushPromises();
      pending[0].d.resolve(detailResponse(makeDetail('g1', { name: 'Older' })));
      await flushPromises();

      expect(store.details.g1.error).toBe(true);
      expect(store.details.g1.data?.name).toBe('Cached');
      expect(store.details.g1.stale).toBe(true);
      expect(store.details.g1.isFetching).toBe(false);
    });

    it('an older success cannot resurrect a group that a newer 404 dropped', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();
      await store.fetchDetail('g1');
      const pending = queueGets();

      void store.fetchDetail('g1');
      store.invalidateGroup('g1');
      void store.fetchDetail('g1');

      pending[1].d.reject(httpError(404));
      await flushPromises();
      pending[0].d.resolve(detailResponse(makeDetail('g1')));
      await flushPromises();

      expect(store.details.g1.data).toBeNull();
      expect(store.details.g1.error).toBe(true);
    });

    it('invalidating a never-fetched key is a no-op for details and does not throw', () => {
      const store = useGroupDataStore();
      expect(() => store.invalidateGroup('unknown')).not.toThrow();
      expect(store.details.unknown).toBeUndefined();
      expect(store.list.stale).toBe(true);
    });
  });

  describe('errors', () => {
    it('a failed refetch keeps cached data and sets error; the next success clears it', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();
      await store.fetchDetail('g1');

      get.mockRejectedValueOnce(httpError(500));
      await expect(store.fetchDetail('g1')).resolves.toBeNull();
      expect(store.details.g1.data?.id).toBe('g1');
      expect(store.details.g1.error).toBe(true);

      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      await store.fetchDetail('g1');
      expect(store.details.g1.error).toBe(false);
    });

    it('a network failure (no response) behaves like a 500', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();
      await store.fetchDetail('g1');

      get.mockRejectedValueOnce(
        Object.assign(new Error('Network Error'), { isAxiosError: true }),
      );
      await store.fetchDetail('g1');
      expect(store.details.g1.data).not.toBeNull();
      expect(store.details.g1.error).toBe(true);
    });

    it('a cold failure leaves data null and error true', async () => {
      get.mockRejectedValueOnce(httpError(500));
      const store = useGroupDataStore();

      await store.fetchDetail('g1');

      expect(store.details.g1.data).toBeNull();
      expect(store.details.g1.error).toBe(true);
      expect(store.details.g1.isFetching).toBe(false);
    });

    it.each([403, 404])('a %i on a detail refetch drops the cached group', async (status) => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('g1')));
      const store = useGroupDataStore();
      await store.fetchDetail('g1');

      get.mockRejectedValueOnce(httpError(status));
      await store.fetchDetail('g1');

      expect(store.details.g1.data).toBeNull();
      expect(store.details.g1.error).toBe(true);
    });

    it('a 404 on the list keeps the cached list (error state only)', async () => {
      get.mockResolvedValueOnce({ data: makeList(['a']) });
      const store = useGroupDataStore();
      await store.fetchList();

      get.mockRejectedValueOnce(httpError(404));
      await store.fetchList();

      expect(store.list.data?.groups).toHaveLength(1);
      expect(store.list.error).toBe(true);
    });

    it('a malformed detail body is treated as a failure', async () => {
      get.mockResolvedValueOnce({ data: {} });
      const store = useGroupDataStore();

      await expect(store.fetchDetail('g1')).resolves.toBeNull();
      expect(store.details.g1.error).toBe(true);
    });

    it('an error on one key does not flag another', async () => {
      get.mockImplementation((url: string) =>
        url === '/groups/bad'
          ? Promise.reject(httpError(500))
          : Promise.resolve(detailResponse(makeDetail('good'))),
      );
      const store = useGroupDataStore();

      await Promise.all([store.fetchDetail('bad'), store.fetchDetail('good')]);

      expect(store.details.bad.error).toBe(true);
      expect(store.details.good.error).toBe(false);
      expect(store.list.error).toBe(false);
    });
  });

  describe('prefetch', () => {
    it(`fetches at most ${PREFETCH_LIMIT} groups`, () => {
      queueGets();
      const store = useGroupDataStore();

      store.prefetchDetails(['a', 'b', 'c', 'd', 'e']);

      expect(get.mock.calls.map(([url]) => url)).toEqual([
        '/groups/a',
        '/groups/b',
        '/groups/c',
      ]);
    });

    it('skips cached groups; the limit counts uncached ones', async () => {
      get.mockResolvedValueOnce(detailResponse(makeDetail('a')));
      const store = useGroupDataStore();
      await store.fetchDetail('a');
      get.mockReset();
      queueGets();

      store.prefetchDetails(['a', 'b', 'c', 'd', 'e']);

      expect(get.mock.calls.map(([url]) => url)).toEqual([
        '/groups/b',
        '/groups/c',
        '/groups/d',
      ]);
    });

    it('does not re-request groups already in flight', () => {
      queueGets();
      const store = useGroupDataStore();
      void store.fetchDetail('a');

      store.prefetchDetails(['a', 'b']);

      expect(detailCalls('a')).toBe(1);
      expect(detailCalls('b')).toBe(1);
    });

    it('swallows failures: no unhandled rejection, entry gets error', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        get.mockRejectedValue(httpError(500));
        const store = useGroupDataStore();

        store.prefetchDetails(['a']);
        await flushPromises();
        await new Promise((r) => setTimeout(r, 0));

        expect(unhandled).not.toHaveBeenCalled();
        expect(store.details.a.error).toBe(true);
        expect(store.details.a.data).toBeNull();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it('an empty id list does nothing', () => {
      const store = useGroupDataStore();
      store.prefetchDetails([]);
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('empties the list and every detail', async () => {
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === '/groups'
            ? { data: makeList(['g1']) }
            : detailResponse(makeDetail('g1')),
        ),
      );
      const store = useGroupDataStore();
      await Promise.all([store.fetchList(), store.fetchDetail('g1')]);

      store.reset();

      expect(store.list.data).toBeNull();
      expect(store.details).toEqual({});
    });

    it('a request in flight during reset never repopulates the store (cross-user leak guard)', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();
      void store.fetchList();
      void store.fetchDetail('g1');

      store.reset();
      pending[0].d.resolve({ data: makeList(['previous-user-group']) });
      pending[1].d.resolve(detailResponse(makeDetail('g1')));
      await flushPromises();

      expect(store.list.data).toBeNull();
      expect(store.details.g1).toBeUndefined();
    });

    it('after reset the next read issues a fresh GET instead of joining the old one', async () => {
      const pending = queueGets();
      const store = useGroupDataStore();
      void store.fetchDetail('g1');

      store.reset();
      void store.fetchDetail('g1');

      expect(detailCalls('g1')).toBe(2);
      pending[1].d.resolve(detailResponse(makeDetail('g1', { name: 'Fresh' })));
      await flushPromises();
      expect(store.details.g1.data?.name).toBe('Fresh');
    });
  });

  describe('no persistence (ADR-0030 §6)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('never touches localStorage, sessionStorage or IndexedDB', async () => {
      const local = vi.spyOn(Storage.prototype, 'setItem');
      const localGet = vi.spyOn(Storage.prototype, 'getItem');
      const idb =
        typeof indexedDB !== 'undefined'
          ? vi.spyOn(indexedDB, 'open')
          : null;
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === '/groups'
            ? { data: makeList(['g1']) }
            : detailResponse(makeDetail('g1')),
        ),
      );
      const store = useGroupDataStore();

      await Promise.all([store.fetchList(), store.fetchDetail('g1')]);
      store.invalidateAll();
      store.prefetchDetails(['g2']);
      await flushPromises();
      store.reset();

      expect(local).not.toHaveBeenCalled();
      expect(localGet).not.toHaveBeenCalled();
      if (idb) expect(idb).not.toHaveBeenCalled();
    });
  });
});
