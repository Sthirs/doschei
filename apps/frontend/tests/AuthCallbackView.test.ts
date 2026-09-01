import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import AuthCallbackView from '@/views/AuthCallbackView.vue';
import { i18n } from '@/i18n';

const mockLoginWithToken = vi.fn();
const mockLogout = vi.fn();
const mockAuthStore = {
  user: null as { id: string } | null,
  loginWithToken: mockLoginWithToken,
  logout: mockLogout,
};
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}));

const mockRouterReplace = vi.fn();
const mockRouteQuery = vi.hoisted(() => ({
  value: {} as Record<string, string>,
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useRoute: () => ({ query: mockRouteQuery.value }),
}));

const mountView = async () => {
  const wrapper = mount(AuthCallbackView, { global: { plugins: [i18n] } });
  await flushPromises();
  return wrapper;
};

describe('AuthCallbackView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.user = null;
    mockRouteQuery.value = {};
  });

  describe('loading state', () => {
    it('renders auth.signingIn while awaiting loginWithToken', async () => {
      mockRouteQuery.value = { token: 'tok-123' };
      let resolveLogin!: () => void;
      mockLoginWithToken.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
      );

      const wrapper = mount(AuthCallbackView, { global: { plugins: [i18n] } });
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain(i18n.global.t('auth.signingIn'));
      expect(wrapper.text()).not.toContain(i18n.global.t('auth.missingToken'));

      mockAuthStore.user = { id: 'user-1' };
      resolveLogin();
      await flushPromises();
    });
  });

  describe('success path', () => {
    it('strips the token from the URL immediately, logs in, and replaces to /groups by default', async () => {
      mockRouteQuery.value = { token: 'tok-123' };
      const replaceStateSpy = vi.spyOn(history, 'replaceState');
      mockLoginWithToken.mockImplementationOnce(async () => {
        mockAuthStore.user = { id: 'user-1' };
      });

      await mountView();

      expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/auth/callback');
      expect(mockLoginWithToken).toHaveBeenCalledWith('tok-123');
      expect(mockRouterReplace).toHaveBeenCalledWith('/groups');
      replaceStateSpy.mockRestore();
    });

    it('replaces to the route.query.redirect target when present', async () => {
      mockRouteQuery.value = { token: 'tok-123', redirect: '/groups/g1' };
      mockLoginWithToken.mockImplementationOnce(async () => {
        mockAuthStore.user = { id: 'user-1' };
      });

      await mountView();

      expect(mockRouterReplace).toHaveBeenCalledWith('/groups/g1');
    });
  });

  describe('missing-token error path', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows auth.missingToken (via i18n key) and redirects to login after 2s', async () => {
      mockRouteQuery.value = {};
      const wrapper = mount(AuthCallbackView, { global: { plugins: [i18n] } });
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain(i18n.global.t('auth.missingToken'));
      expect(wrapper.text()).toContain(
        i18n.global.t('auth.redirectingToLogin'),
      );
      expect(mockLoginWithToken).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockRouterReplace).toHaveBeenCalledWith({
        name: 'login',
        query: { error: 'oauth_failed' },
      });
    });
  });

  describe('loginWithToken failure path', () => {
    it('logs out and replaces to login?error=oauth_failed when loginWithToken rejects', async () => {
      mockRouteQuery.value = { token: 'tok-123' };
      mockLoginWithToken.mockRejectedValueOnce(new Error('network'));

      await mountView();

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith({
        name: 'login',
        query: { error: 'oauth_failed' },
      });
    });

    it('logs out and replaces to login?error=oauth_failed when loginWithToken resolves but leaves user unset', async () => {
      mockRouteQuery.value = { token: 'tok-123' };
      mockLoginWithToken.mockResolvedValueOnce(undefined);
      mockAuthStore.user = null;

      await mountView();

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith({
        name: 'login',
        query: { error: 'oauth_failed' },
      });
    });
  });
});
