import {
  computed,
  onMounted,
  onUnmounted,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';

import {
  useGroupDataStore,
  type CacheEntry,
} from '@/stores/groupData';
import type { GroupDetail, GroupsListResponse } from '@/types/group';

export type CachedRead<T> = {
  data: ComputedRef<T | null>;
  /** Nothing cached yet and no failure: the only case that shows "Loading…". */
  isInitialLoading: ComputedRef<boolean>;
  /** Cached data is on screen but the last refetch failed (non-blocking). */
  refreshFailed: ComputedRef<boolean>;
  /** Nothing cached and the fetch failed: the full-screen error. */
  blockingError: ComputedRef<boolean>;
  refresh: () => Promise<T | null>;
};

/**
 * ADR-0030 stale-while-revalidate read: render the cached value, always
 * revalidate on mount, and refetch whenever the entry is invalidated while the
 * view is mounted (visibility, push, or a write elsewhere).
 *
 * MUST be called synchronously from `setup()`.
 */
const useCachedRead = <T>(
  entry: () => CacheEntry<T> | undefined,
  fetch: () => Promise<T | null>,
  key: () => string,
): CachedRead<T> => {
  const data = computed(() => entry()?.data ?? null);
  const error = computed(() => entry()?.error ?? false);

  let mounted = false;
  const refresh = () => fetch();

  onMounted(() => {
    mounted = true;
    void refresh();
  });
  onUnmounted(() => {
    mounted = false;
  });

  // A changed key (route param) or a bumped version (invalidation) refetches.
  watch([key, () => entry()?.version], ([nextKey], [prevKey]) => {
    if (!mounted) return;
    if (nextKey !== prevKey || entry()?.stale) void refresh();
  });

  return {
    data,
    isInitialLoading: computed(() => !data.value && !error.value),
    refreshFailed: computed(() => Boolean(data.value) && error.value),
    blockingError: computed(() => !data.value && error.value),
    refresh,
  };
};

export const useCachedGroupsList = (): CachedRead<GroupsListResponse> => {
  const store = useGroupDataStore();
  return useCachedRead(
    () => store.list,
    () => store.fetchList(),
    () => 'list',
  );
};

export const useCachedGroupDetail = (
  groupId: Ref<string>,
): CachedRead<GroupDetail> => {
  const store = useGroupDataStore();
  return useCachedRead(
    () => store.details[groupId.value],
    () => store.fetchDetail(groupId.value),
    () => groupId.value,
  );
};
