import axios from 'axios';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { api } from '@/lib/api';
import type { GroupDetail, GroupsListResponse } from '@/types/group';

/**
 * ADR-0030: in-memory, stale-while-revalidate cache of the groups list and of
 * every opened group detail. Views render `data` immediately and always
 * revalidate; balances still come only from the server (ADR-0006).
 *
 * Nothing here is persisted: no localStorage, no IndexedDB, no service-worker
 * cache. The store dies with the page (ADR-0020 reload on deploy) and is
 * `reset()` on logout and session loss (ADR-0023, see lib/groupDataLifecycle).
 */
export type CacheEntry<T> = {
  data: T | null;
  isFetching: boolean;
  /** The last request for this key failed. Cached `data` is kept. */
  error: boolean;
  /** Invalidated since the data on screen was fetched. */
  stale: boolean;
  /** Bumped by every invalidation; views watch it to refetch while mounted. */
  version: number;
  /**
   * Version of the newest request that has settled (success or failure).
   * Anything older that lands afterwards is dropped, so it can neither
   * overwrite newer data nor clear a newer failure.
   */
  settledVersion: number;
};

export const PREFETCH_LIMIT = 3;

const LIST_KEY = 'list';
const detailKey = (groupId: string) => `detail:${groupId}`;

const emptyEntry = <T>(): CacheEntry<T> => ({
  data: null,
  isFetching: false,
  error: false,
  stale: false,
  version: 0,
  settledVersion: 0,
});

/** The group is gone for this user (deleted, or they were removed from it). */
const isGone = (err: unknown): boolean =>
  axios.isAxiosError(err) &&
  (err.response?.status === 403 || err.response?.status === 404);

type InFlight = { promise: Promise<unknown>; version: number };

export const useGroupDataStore = defineStore('groupData', () => {
  const list = ref<CacheEntry<GroupsListResponse>>(emptyEntry());
  const details = ref<Record<string, CacheEntry<GroupDetail>>>({});

  // Not reactive on purpose: views never render these.
  const inFlight = new Map<string, InFlight>();
  let epoch = 0;

  const detailEntry = (groupId: string): CacheEntry<GroupDetail> => {
    if (!details.value[groupId]) details.value[groupId] = emptyEntry();
    return details.value[groupId];
  };

  /**
   * One request per key and version. A read after an invalidation never joins
   * a request that started before it, so a save is always followed by a
   * fetch that can see it.
   */
  const run = <T>(
    key: string,
    entry: () => CacheEntry<T>,
    request: () => Promise<T>,
    clearOnGone = false,
  ): Promise<T | null> => {
    const target = entry();
    const pending = inFlight.get(key);
    if (pending && pending.version === target.version) {
      return pending.promise as Promise<T | null>;
    }

    const startEpoch = epoch;
    const version = target.version;
    target.isFetching = true;

    const settle = (apply: (current: CacheEntry<T>) => void) => {
      if (startEpoch !== epoch) return; // reset() ran: never leak across users
      const current = entry();
      if (inFlight.get(key)?.promise === promise) {
        inFlight.delete(key);
        current.isFetching = false;
      }
      // An older response never overrides a newer one, success or failure.
      if (version < current.settledVersion) return;
      current.settledVersion = version;
      apply(current);
    };

    const promise: Promise<T | null> = request().then(
      (data) => {
        let result: T | null = null;
        settle((current) => {
          current.data = data;
          current.error = false;
          current.stale = version < current.version;
          result = data;
        });
        return result;
      },
      (err: unknown) => {
        settle((current) => {
          current.error = true;
          if (clearOnGone && isGone(err)) current.data = null;
        });
        return null;
      },
    );

    inFlight.set(key, { promise, version });
    return promise;
  };

  const fetchList = (): Promise<GroupsListResponse | null> =>
    run(
      LIST_KEY,
      () => list.value,
      async () => {
        const { data } = await api.get<GroupsListResponse>('/groups');
        if (!data || !Array.isArray(data.groups)) {
          throw new Error('Malformed groups list response');
        }
        return { groups: data.groups, invitations: data.invitations ?? [] };
      },
    );

  const fetchDetail = (groupId: string): Promise<GroupDetail | null> =>
    run(
      detailKey(groupId),
      () => detailEntry(groupId),
      async () => {
        const { data } = await api.get<{ group: GroupDetail }>(
          `/groups/${groupId}`,
        );
        if (!data?.group) throw new Error('Malformed group response');
        return data.group;
      },
      true,
    );

  const cachedDetail = (groupId: string): GroupDetail | null =>
    details.value[groupId]?.data ?? null;

  const markStale = (entry: CacheEntry<unknown>) => {
    entry.stale = true;
    entry.version += 1;
  };

  const invalidateList = () => markStale(list.value);

  /** After any write to a group: its detail and the list (balances) change. */
  const invalidateGroup = (groupId: string) => {
    const entry = details.value[groupId];
    if (entry) markStale(entry);
    invalidateList();
  };

  const invalidateAll = () => {
    Object.values(details.value).forEach(markStale);
    invalidateList();
  };

  /** Warm the first few uncached groups so the first open is instant. */
  const prefetchDetails = (groupIds: readonly string[]) => {
    groupIds
      .filter(
        (id) => !details.value[id]?.data && !inFlight.has(detailKey(id)),
      )
      .slice(0, PREFETCH_LIMIT)
      .forEach((id) => void fetchDetail(id));
  };

  const reset = () => {
    epoch += 1;
    inFlight.clear();
    list.value = emptyEntry();
    details.value = {};
  };

  return {
    list,
    details,
    fetchList,
    fetchDetail,
    cachedDetail,
    invalidateList,
    invalidateGroup,
    invalidateAll,
    prefetchDetails,
    reset,
  };
});

export type GroupDataStore = ReturnType<typeof useGroupDataStore>;
