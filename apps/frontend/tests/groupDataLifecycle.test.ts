import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installGroupDataLifecycle } from '@/lib/groupDataLifecycle';
import { useAuthStore } from '@/stores/auth';
import { useGroupDataStore } from '@/stores/groupData';
import type { AuthUser } from '@/types/auth';
import { freshEntry } from './helpers/groupDataCache';

const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: (...a: unknown[]) => mockApiPost(...a) },
}));
vi.mock('@/lib/sessionRefresh', () => ({
  tryRestoreSession: vi.fn(),
  suppressSessionRestore: vi.fn(),
}));
vi.mock('@/lib/push', () => ({ removePushSubscription: vi.fn() }));
vi.mock('@/i18n', () => ({ normalizeLocale: (l: string) => l, setAppLocale: vi.fn() }));

const user = (id: string) => ({ id, email: `${id}@x`, displayName: id }) as AuthUser;

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  show(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

class FakeServiceWorker extends EventTarget {
  startMessages = vi.fn();
  post(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

const memStore: Record<string, string> = {};

describe('installGroupDataLifecycle (ADR-0030 §6)', () => {
  let doc: FakeDocument;
  let sw: FakeServiceWorker;
  let uninstall: () => void;

  const setup = (opts: { token?: string; userId?: string; withSw?: boolean } = {}) => {
    const authStore = useAuthStore();
    authStore.token = opts.token ?? 'abc';
    authStore.user = opts.userId === undefined ? user('u1') : opts.userId ? user(opts.userId) : null;
    const groupData = useGroupDataStore();
    // Something cached for the session, so a reset is observable.
    groupData.details.g1 = freshEntry({ id: 'g1' } as never);
    const spies = {
      reset: vi.spyOn(groupData, 'reset'),
      invalidateAll: vi.spyOn(groupData, 'invalidateAll'),
      invalidateGroup: vi.spyOn(groupData, 'invalidateGroup'),
      invalidateList: vi.spyOn(groupData, 'invalidateList'),
    };
    uninstall = installGroupDataLifecycle({
      authStore,
      groupData,
      doc,
      serviceWorker: opts.withSw === false ? undefined : sw,
    });
    return { authStore, groupData, ...spies };
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in memStore ? memStore[k] : null),
      setItem: (k: string, v: string) => { memStore[k] = String(v); },
      removeItem: (k: string) => { delete memStore[k]; },
      clear: () => undefined,
    });
    mockApiPost.mockReset().mockResolvedValue({ data: {} });
    doc = new FakeDocument();
    sw = new FakeServiceWorker();
  });

  afterEach(() => {
    uninstall?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('session end', () => {
    it('clearSession() (token → empty) resets the cache exactly once', () => {
      const { authStore, groupData, reset } = setup();

      authStore.clearSession();

      expect(reset).toHaveBeenCalledTimes(1);
      expect(groupData.details).toEqual({});
    });

    it('logout() leaves the cache empty', async () => {
      const { authStore, groupData } = setup();

      await authStore.logout();

      expect(groupData.details).toEqual({});
      expect(groupData.list.data).toBeNull();
    });

    it('session loss (the onSessionExpired path calls clearSession) resets', () => {
      const { authStore, reset } = setup();
      // main.ts's onSessionExpired handler is `useAuthStore().clearSession()`.
      authStore.clearSession();
      expect(reset).toHaveBeenCalled();
    });

    it('a different user signing in (user.id u1 → u2) resets', () => {
      const { authStore, reset } = setup();

      authStore.user = user('u2');

      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('unrelated auth state changes do not reset', () => {
      const { authStore, reset } = setup();

      authStore.isLoading = true;
      authStore.isLoading = false;
      authStore.setToken('rotated-token'); // silent refresh, same user
      authStore.user = user('u1'); // same user re-fetched

      expect(reset).not.toHaveBeenCalled();
    });

    it('signing in from signed-out does not reset (nothing to clear)', () => {
      const { authStore, reset } = setup({ token: '', userId: '' });

      authStore.setToken('new');
      authStore.user = user('u9');

      expect(reset).not.toHaveBeenCalled();
    });
  });

  describe('visibility', () => {
    it('becoming visible marks everything stale', () => {
      const { invalidateAll } = setup();
      doc.show('visible');
      expect(invalidateAll).toHaveBeenCalledTimes(1);
    });

    it('becoming hidden does nothing', () => {
      const { invalidateAll } = setup();
      doc.show('hidden');
      expect(invalidateAll).not.toHaveBeenCalled();
    });
  });

  describe('push messages from the service worker', () => {
    it('starts the client message queue', () => {
      setup();
      expect(sw.startMessages).toHaveBeenCalled();
    });

    it('a push for /groups/g1 invalidates that group', () => {
      const { groupData, invalidateGroup, invalidateList } = setup();
      sw.post({ type: 'push', url: '/groups/g1' });
      expect(invalidateGroup).toHaveBeenCalledWith('g1');
      expect(invalidateList).not.toHaveBeenCalled();
      expect(groupData.details.g1.stale).toBe(true);
      // invalidateGroup also marks the list (balances changed).
      expect(groupData.list.stale).toBe(true);
    });

    it('a push without a group URL invalidates only the list', () => {
      const { invalidateGroup, invalidateList } = setup();
      sw.post({ type: 'push', url: '/' });
      expect(invalidateGroup).not.toHaveBeenCalled();
      expect(invalidateList).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an unrelated type', { type: 'other', url: '/groups/g1' }],
      ['null', null],
      ['a string', 'push'],
      ['a missing url', { type: 'push' }],
      ['a non-string url', { type: 'push', url: 42 }],
    ])('ignores %s without throwing', (_label, data) => {
      const { invalidateGroup, invalidateList } = setup();
      expect(() => sw.post(data)).not.toThrow();
      expect(invalidateGroup).not.toHaveBeenCalled();
      expect(invalidateList).not.toHaveBeenCalled();
    });

    it('installs without a service worker (unsupported browser)', () => {
      expect(() => setup({ withSw: false })).not.toThrow();
    });
  });

  it('uninstall removes every listener', () => {
    const { authStore, reset, invalidateAll, invalidateGroup } = setup();

    uninstall();
    doc.show('visible');
    sw.post({ type: 'push', url: '/groups/g1' });
    authStore.clearSession();

    expect(invalidateAll).not.toHaveBeenCalled();
    expect(invalidateGroup).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
