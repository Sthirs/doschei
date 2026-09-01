import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

import AppTopbar from '@/components/AppTopbar.vue';
import { i18n } from '@/i18n';

const mockCurrentPageTitle = vi.hoisted(() => ({
  value: null as string | null,
}));
vi.mock('@/router', () => ({
  currentPageTitle: mockCurrentPageTitle,
}));

const mockRouteMeta = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
const mockRouterPush = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ meta: mockRouteMeta.value }),
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockAuthStore = vi.hoisted(() => ({
  user: null as { displayName?: string; imageUrl?: string | null } | null,
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}));

const mountTopbar = () => mount(AppTopbar, { global: { plugins: [i18n] } });

describe('AppTopbar — title resolution priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPageTitle.value = null;
    mockRouteMeta.value = {};
    mockAuthStore.user = null;
  });

  it('prefers currentPageTitle over route.meta.title and the fallback', () => {
    mockCurrentPageTitle.value = 'Weekend in Venice';
    mockRouteMeta.value = { title: 'Groups' };
    const wrapper = mountTopbar();
    expect(wrapper.find('h1').text()).toBe('Weekend in Venice');
  });

  it('falls back to route.meta.title when currentPageTitle is null', () => {
    mockCurrentPageTitle.value = null;
    mockRouteMeta.value = { title: 'Groups' };
    const wrapper = mountTopbar();
    expect(wrapper.find('h1').text()).toBe('Groups');
  });

  it('falls back to the app.fallbackTitle i18n key when both are absent', () => {
    mockCurrentPageTitle.value = null;
    mockRouteMeta.value = {};
    const wrapper = mountTopbar();
    expect(wrapper.find('h1').text()).toBe(i18n.global.t('app.fallbackTitle'));
  });
});

describe('AppTopbar — account avatar button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPageTitle.value = null;
    mockRouteMeta.value = {};
    mockAuthStore.user = null;
  });

  it('renders the user initial (uppercased) when there is no imageUrl', () => {
    mockAuthStore.user = { displayName: 'alice', imageUrl: null };
    const wrapper = mountTopbar();
    const button = wrapper.find('button');
    expect(button.find('img').exists()).toBe(false);
    expect(button.find('span').text()).toBe('A');
  });

  it("renders 'U' when there is no authenticated user", () => {
    mockAuthStore.user = null;
    const wrapper = mountTopbar();
    expect(wrapper.find('button span').text()).toBe('U');
  });

  it('renders the profile image when user.imageUrl is set', () => {
    mockAuthStore.user = {
      displayName: 'Bob',
      imageUrl: 'https://example.com/bob.jpg',
    };
    const wrapper = mountTopbar();
    const img = wrapper.find('button img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/bob.jpg');
    expect(wrapper.find('button span').exists()).toBe(false);
  });

  it('sets the aria-label from the app.openAccountPageAria i18n key', () => {
    const wrapper = mountTopbar();
    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe(
      i18n.global.t('app.openAccountPageAria'),
    );
  });

  it('navigates to the account route when clicked', async () => {
    const wrapper = mountTopbar();
    await wrapper.find('button').trigger('click');
    expect(mockRouterPush).toHaveBeenCalledWith({ name: 'account' });
  });
});

describe('AppTopbar — teleport target slots', () => {
  it('renders the #topbar-leading and #topbar-actions slot anchors for child views to teleport into', () => {
    const wrapper = mountTopbar();
    expect(wrapper.find('#topbar-leading').exists()).toBe(true);
    expect(wrapper.find('#topbar-actions').exists()).toBe(true);
  });
});
