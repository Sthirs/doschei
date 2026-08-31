import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import LoginView from '@/views/LoginView.vue';
import { i18n } from '@/i18n';

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

const mockLogin = vi.fn();
const mockAuthStore = { isLoading: false, login: mockLogin };
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}));

const mockRouterPush = vi.fn();
const mockRouteQuery = vi.hoisted(() => ({
  value: {} as Record<string, string>,
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useRoute: () => ({ query: mockRouteQuery.value }),
}));

// api.get('/auth/oauth/config') and api.get('/auth/config') resolve in
// registration order (oauth first, then auth) per LoginView's onMounted.
const mockOauthAndAuthConfig = (
  oauthConfig: { enabled: boolean; buttonText: string; autoLaunch: boolean },
  authConfig: {
    localLoginEnabled: boolean;
    localRegistrationEnabled: boolean;
  } = {
    localLoginEnabled: true,
    localRegistrationEnabled: true,
  },
) => {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/auth/oauth/config')
      return Promise.resolve({ data: oauthConfig });
    if (url === '/auth/config') return Promise.resolve({ data: authConfig });
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
};

const mountView = async () => {
  const wrapper = mount(LoginView, { global: { plugins: [i18n] } });
  await flushPromises();
  return wrapper;
};

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.isLoading = false;
    mockRouteQuery.value = {};
    mockApiGet.mockReset();
    mockApiGet.mockRejectedValue(new Error('network'));
  });

  it('renders the local-login form when oauth/auth config endpoints are unavailable (both catches hit)', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('input#email').exists()).toBe(true);
    expect(wrapper.find('input#password').exists()).toBe(true);
    expect(wrapper.text()).toContain(i18n.global.t('login.welcome'));
  });

  it('submit success: calls auth.login then pushes the default /groups redirect target', async () => {
    mockOauthAndAuthConfig({
      enabled: false,
      buttonText: '',
      autoLaunch: false,
    });
    mockLogin.mockResolvedValueOnce(undefined);
    const wrapper = await mountView();

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith('/groups');
  });

  it('submit success: pushes the route.query.redirect target when present', async () => {
    mockOauthAndAuthConfig({
      enabled: false,
      buttonText: '',
      autoLaunch: false,
    });
    mockRouteQuery.value = { redirect: '/groups/g1' };
    mockLogin.mockResolvedValueOnce(undefined);
    const wrapper = await mountView();

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(mockRouterPush).toHaveBeenCalledWith('/groups/g1');
  });

  it('submit failure: shows the login.loginFailed message obtained through the real i18n catalog, does not navigate', async () => {
    mockOauthAndAuthConfig({
      enabled: false,
      buttonText: '',
      autoLaunch: false,
    });
    mockLogin.mockRejectedValueOnce(new Error('bad credentials'));
    const wrapper = await mountView();

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('login.loginFailed'));
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('loading state: submit button shows login.loggingIn and is disabled while authStore.isLoading is true', async () => {
    mockOauthAndAuthConfig({
      enabled: false,
      buttonText: '',
      autoLaunch: false,
    });
    mockAuthStore.isLoading = true;
    const wrapper = await mountView();

    const button = wrapper.find('button[type="submit"]');
    expect(button.text()).toContain(i18n.global.t('login.loggingIn'));
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('renders the OAuth button with the server-supplied buttonText when oauth is enabled', async () => {
    mockOauthAndAuthConfig({
      enabled: true,
      buttonText: 'Continue with Google',
      autoLaunch: false,
    });
    const wrapper = await mountView();

    const oauthLink = wrapper.find('a[href="/api/auth/oauth"]');
    expect(oauthLink.exists()).toBe(true);
    expect(oauthLink.text()).toContain('Continue with Google');
  });

  it('renders login.signInUnavailable when local login is disabled and oauth is disabled', async () => {
    mockOauthAndAuthConfig(
      { enabled: false, buttonText: '', autoLaunch: false },
      { localLoginEnabled: false, localRegistrationEnabled: false },
    );
    const wrapper = await mountView();

    expect(wrapper.text()).toContain(i18n.global.t('login.signInUnavailable'));
    expect(wrapper.find('input#email').exists()).toBe(false);
  });

  it('auto-launches OAuth by setting window.location.href when autoLaunch+enabled are both true', async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      configurable: true,
      writable: true,
    });
    try {
      mockOauthAndAuthConfig({
        enabled: true,
        buttonText: 'Continue with Google',
        autoLaunch: true,
      });
      await mountView();
      expect(window.location.href).toBe('/api/auth/oauth');
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        configurable: true,
        writable: true,
      });
    }
  });
});
