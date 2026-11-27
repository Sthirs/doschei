import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';

import {
  useCachedGroupDetail,
  useCachedGroupsList,
  type CachedRead,
} from '@/composables/useGroupData';
import { api } from '@/lib/api';
import { useGroupDataStore } from '@/stores/groupData';
import type { GroupDetail, GroupsListResponse } from '@/types/group';
import {
  deferred,
  httpError,
  seedGroupDetail,
  seedGroupsList,
} from './helpers/groupDataCache';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
const get = api.get as unknown as ReturnType<typeof vi.fn>;

const makeDetail = (id: string, name = `Group ${id}`) =>
  ({
    id,
    name,
    imageUrl: null,
    memberCount: 1,
    members: [],
    netForCurrentUser: 0,
    expenses: [],
    balance: { currentUserId: 'u1', currentUserName: 'A', netForCurrentUser: 0, perUser: [] },
  }) as GroupDetail;

const makeList = (ids: string[]): GroupsListResponse => ({
  groups: ids.map((id) => ({
    id,
    name: id,
    imageUrl: null,
    memberCount: 1,
    members: [],
    netForCurrentUser: 0,
  })),
  invitations: [],
});

/** Snapshot of every flag at first render, to prove there is no loading flash. */
type FirstRender = { isInitialLoading: boolean; hasData: boolean };

const mountDetail = (groupId: Ref<string>) => {
  let read!: CachedRead<GroupDetail>;
  let first: FirstRender | undefined;
  const Host = defineComponent({
    setup() {
      read = useCachedGroupDetail(groupId);
      return () => {
        first ??= {
          isInitialLoading: read.isInitialLoading.value,
          hasData: Boolean(read.data.value),
        };
        return h('div', read.data.value?.name ?? '');
      };
    },
  });
  const wrapper = mount(Host);
  return { wrapper, read: () => read, first: () => first! };
};

const mountList = () => {
  let read!: CachedRead<GroupsListResponse>;
  let first: FirstRender | undefined;
  const Host = defineComponent({
    setup() {
      read = useCachedGroupsList();
      return () => {
        first ??= {
          isInitialLoading: read.isInitialLoading.value,
          hasData: Boolean(read.data.value),
        };
        return h('div');
      };
    },
  });
  const wrapper = mount(Host);
  return { wrapper, read: () => read, first: () => first! };
};

describe('useCachedGroupDetail (ADR-0030)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    get.mockReset();
  });

  it('cold: initial loading, then data; never a blocking error', async () => {
    const d = deferred<unknown>();
    get.mockReturnValueOnce(d.promise);

    const { read, first } = mountDetail(ref('g1'));
    expect(first().isInitialLoading).toBe(true);
    expect(read().blockingError.value).toBe(false);

    d.resolve({ data: { group: makeDetail('g1') } });
    await flushPromises();

    expect(read().isInitialLoading.value).toBe(false);
    expect(read().data.value?.id).toBe('g1');
    expect(read().blockingError.value).toBe(false);
    expect(read().refreshFailed.value).toBe(false);
  });

  it('warm: first render already has data (no loading) and a revalidation GET is issued', async () => {
    seedGroupDetail(makeDetail('g1', 'Cached'));
    get.mockResolvedValueOnce({ data: { group: makeDetail('g1', 'Fresh') } });

    const { wrapper, first } = mountDetail(ref('g1'));

    expect(first()).toEqual({ isInitialLoading: false, hasData: true });
    expect(wrapper.text()).toBe('Cached');
    expect(get).toHaveBeenCalledWith('/groups/g1');

    await flushPromises();
    expect(wrapper.text()).toBe('Fresh');
  });

  it('refetch failure with data → refreshFailed, not blockingError', async () => {
    seedGroupDetail(makeDetail('g1'));
    get.mockRejectedValueOnce(httpError(500));

    const { read } = mountDetail(ref('g1'));
    await flushPromises();

    expect(read().refreshFailed.value).toBe(true);
    expect(read().blockingError.value).toBe(false);
    expect(read().data.value?.id).toBe('g1');
  });

  it('cold failure → blockingError', async () => {
    get.mockRejectedValueOnce(httpError(500));

    const { read } = mountDetail(ref('g1'));
    await flushPromises();

    expect(read().blockingError.value).toBe(true);
    expect(read().isInitialLoading.value).toBe(false);
    expect(read().refreshFailed.value).toBe(false);
  });

  it('a retry after a cold failure shows loading, not the error, until it settles', async () => {
    // e.g. a prefetch failed on a flaky network; the user then opens the group.
    const store = useGroupDataStore();
    store.details.g1 = {
      data: null,
      isFetching: false,
      error: true,
      stale: false,
      version: 0,
      settledVersion: 0,
    };
    const ok = deferred<unknown>();
    get.mockReturnValueOnce(ok.promise);

    const { read } = mountDetail(ref('g1'));
    await nextTick();

    expect(read().isInitialLoading.value).toBe(true);
    expect(read().blockingError.value).toBe(false);

    ok.resolve({ data: { group: makeDetail('g1') } });
    await flushPromises();
    expect(read().data.value?.id).toBe('g1');
    expect(read().blockingError.value).toBe(false);
  });

  it('a retry that fails again ends in blockingError', async () => {
    const store = useGroupDataStore();
    store.details.g1 = {
      data: null,
      isFetching: false,
      error: true,
      stale: false,
      version: 0,
      settledVersion: 0,
    };
    const fail = deferred<unknown>();
    get.mockReturnValueOnce(fail.promise);

    const { read } = mountDetail(ref('g1'));
    await nextTick();
    expect(read().blockingError.value).toBe(false);

    fail.reject(httpError(500));
    await flushPromises();
    expect(read().isInitialLoading.value).toBe(false);
    expect(read().blockingError.value).toBe(true);
  });

  it('a 404 refetch on cached data switches to blockingError', async () => {
    seedGroupDetail(makeDetail('g1'));
    get.mockRejectedValueOnce(httpError(404));

    const { read } = mountDetail(ref('g1'));
    await flushPromises();

    expect(read().data.value).toBeNull();
    expect(read().blockingError.value).toBe(true);
  });

  it('a groupId change fetches the new group and never shows the old one under it', async () => {
    seedGroupDetail(makeDetail('g1', 'One'));
    get.mockImplementation((url: string) => {
      if (url === '/groups/g2') return new Promise(() => {}); // never settles
      return Promise.resolve({ data: { group: makeDetail('g1', 'One') } });
    });
    const groupId = ref('g1');
    const { wrapper, read } = mountDetail(groupId);
    await flushPromises();
    expect(wrapper.text()).toBe('One');

    groupId.value = 'g2';
    await nextTick();

    expect(get).toHaveBeenCalledWith('/groups/g2');
    expect(read().data.value).toBeNull();
    expect(read().isInitialLoading.value).toBe(true);
    expect(wrapper.text()).toBe('');
  });

  it('an invalidation while mounted triggers exactly one refetch', async () => {
    seedGroupDetail(makeDetail('g1'));
    get.mockResolvedValue({ data: { group: makeDetail('g1') } });
    mountDetail(ref('g1'));
    await flushPromises();
    expect(get).toHaveBeenCalledTimes(1);

    useGroupDataStore().invalidateGroup('g1');
    await flushPromises();

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('each further invalidation while a refetch is in flight refetches again', async () => {
    seedGroupDetail(makeDetail('g1'));
    get.mockImplementation(() => new Promise(() => {}));
    mountDetail(ref('g1'));
    await flushPromises();
    const store = useGroupDataStore();

    store.invalidateGroup('g1');
    await flushPromises();
    store.invalidateGroup('g1');
    await flushPromises();

    expect(get).toHaveBeenCalledTimes(3);
  });

  it('after unmount an invalidation does not refetch', async () => {
    seedGroupDetail(makeDetail('g1'));
    get.mockResolvedValue({ data: { group: makeDetail('g1') } });
    const { wrapper } = mountDetail(ref('g1'));
    await flushPromises();
    wrapper.unmount();

    useGroupDataStore().invalidateGroup('g1');
    await flushPromises();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('invalidating another group does not refetch this one', async () => {
    seedGroupDetail(makeDetail('g1'));
    seedGroupDetail(makeDetail('g2'));
    get.mockResolvedValue({ data: { group: makeDetail('g1') } });
    mountDetail(ref('g1'));
    await flushPromises();

    useGroupDataStore().invalidateGroup('g2');
    await flushPromises();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('refresh() forces a refetch', async () => {
    seedGroupDetail(makeDetail('g1'));
    get.mockResolvedValue({ data: { group: makeDetail('g1') } });
    const { read } = mountDetail(ref('g1'));
    await flushPromises();

    await read().refresh();

    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('useCachedGroupsList (ADR-0030)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    get.mockReset();
  });

  it('cold: initial loading, then data', async () => {
    get.mockResolvedValueOnce({ data: makeList(['a']) });
    const { read, first } = mountList();
    expect(first().isInitialLoading).toBe(true);
    await flushPromises();
    expect(read().data.value?.groups).toHaveLength(1);
    expect(read().isInitialLoading.value).toBe(false);
  });

  it('warm: data on first render and a revalidation GET', async () => {
    seedGroupsList(makeList(['a']));
    get.mockResolvedValueOnce({ data: makeList(['a', 'b']) });
    const { read, first } = mountList();
    expect(first()).toEqual({ isInitialLoading: false, hasData: true });
    expect(get).toHaveBeenCalledWith('/groups');
    await flushPromises();
    expect(read().data.value?.groups).toHaveLength(2);
  });

  it('refresh failure with data → refreshFailed; cold failure → blockingError', async () => {
    seedGroupsList(makeList(['a']));
    get.mockRejectedValueOnce(httpError(500));
    const warm = mountList();
    await flushPromises();
    expect(warm.read().refreshFailed.value).toBe(true);
    expect(warm.read().blockingError.value).toBe(false);
    warm.wrapper.unmount();

    setActivePinia(createPinia());
    get.mockRejectedValueOnce(httpError(500));
    const cold = mountList();
    await flushPromises();
    expect(cold.read().blockingError.value).toBe(true);
  });

  it('a retry after a cold list failure shows loading, not the error', async () => {
    const store = useGroupDataStore();
    store.list.error = true;
    const ok = deferred<unknown>();
    get.mockReturnValueOnce(ok.promise);

    const { read } = mountList();
    await nextTick();
    expect(read().isInitialLoading.value).toBe(true);
    expect(read().blockingError.value).toBe(false);

    ok.resolve({ data: makeList(['a']) });
    await flushPromises();
    expect(read().data.value?.groups).toHaveLength(1);
    expect(read().blockingError.value).toBe(false);
  });

  it('an invalidation while mounted refetches; after unmount it does not', async () => {
    seedGroupsList(makeList(['a']));
    get.mockResolvedValue({ data: makeList(['a']) });
    const { wrapper } = mountList();
    await flushPromises();

    useGroupDataStore().invalidateList();
    await flushPromises();
    expect(get).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    useGroupDataStore().invalidateList();
    await flushPromises();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
