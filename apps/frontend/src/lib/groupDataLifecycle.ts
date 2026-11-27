import { groupIdFromPushUrl } from '@/lib/notificationRouting';
import type { GroupDataStore } from '@/stores/groupData';

type AuthStoreLike = {
  token: string;
  user: { id: string } | null;
  $subscribe: (
    callback: () => void,
    options?: { flush?: 'sync' | 'pre' | 'post'; detached?: boolean },
  ) => () => void;
};

type EventSourceLike = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export type GroupDataLifecycleDeps = {
  authStore: AuthStoreLike;
  groupData: Pick<
    GroupDataStore,
    'reset' | 'invalidateAll' | 'invalidateGroup' | 'invalidateList'
  >;
  doc: EventSourceLike & { visibilityState: DocumentVisibilityState };
  serviceWorker?: EventSourceLike & { startMessages?: () => void };
};

/** Message `sw.ts` posts to every window client when a push arrives. */
export type PushClientMessage = { type: 'push'; url: string };

const isPushMessage = (data: unknown): data is PushClientMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === 'push' &&
  typeof (data as { url?: unknown }).url === 'string';

/**
 * ADR-0030 §6: bounds the lifetime of the group data cache.
 *
 * - cleared when the session ends (logout, session loss — ADR-0023) or the
 *   signed-in user changes, so one user's groups never render for another;
 * - marked stale when the page becomes visible again and when a push for a
 *   group arrives (ADR-0025), so mounted views revalidate.
 *
 * Wired from main.ts (not stores/auth.ts) so the auth store keeps no
 * dependency on the data store. Returns an uninstall function.
 */
export function installGroupDataLifecycle(deps: GroupDataLifecycleDeps): () => void {
  const { authStore, groupData, doc, serviceWorker } = deps;

  let lastToken = authStore.token;
  let lastUserId = authStore.user?.id ?? null;

  const stopAuth = authStore.$subscribe(
    () => {
      const token = authStore.token;
      const userId = authStore.user?.id ?? null;
      const signedOut = Boolean(lastToken) && !token;
      const switchedUser =
        lastUserId !== null && userId !== null && userId !== lastUserId;
      lastToken = token;
      lastUserId = userId;
      if (signedOut || switchedUser) groupData.reset();
    },
    // Sync, so the cache is gone before the next user's first fetch.
    { flush: 'sync', detached: true },
  );

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') groupData.invalidateAll();
  };

  const onMessage = (event: Event) => {
    const data: unknown = (event as MessageEvent).data;
    if (!isPushMessage(data)) return;
    const groupId = groupIdFromPushUrl(data.url);
    if (groupId) groupData.invalidateGroup(groupId);
    else groupData.invalidateList();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  serviceWorker?.addEventListener('message', onMessage);
  serviceWorker?.startMessages?.();

  return () => {
    stopAuth();
    doc.removeEventListener('visibilitychange', onVisibility);
    serviceWorker?.removeEventListener('message', onMessage);
  };
}
