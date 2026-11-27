import { useGroupDataStore, type CacheEntry } from '@/stores/groupData';
import type { GroupDetail, GroupsListResponse } from '@/types/group';

/** A settled, fresh cache entry, as if fetched a moment ago. */
export const freshEntry = <T>(data: T | null): CacheEntry<T> => ({
  data,
  isFetching: false,
  error: false,
  stale: false,
  version: 0,
  settledVersion: 0,
});

/**
 * Seed the ADR-0030 cache with a group detail, which replaces the old
 * `sharedGroup` hand-off. Needs an active Pinia (`setActivePinia`).
 */
export const seedGroupDetail = (group: GroupDetail) => {
  const store = useGroupDataStore();
  store.details[group.id] = freshEntry(group);
  return store;
};

export const seedGroupsList = (list: GroupsListResponse) => {
  const store = useGroupDataStore();
  store.list = freshEntry(list);
  return store;
};

/** A promise whose settlement the test controls. */
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** An axios-shaped HTTP error, as `api` rejects with. */
export const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
    toJSON: () => ({}),
  });
