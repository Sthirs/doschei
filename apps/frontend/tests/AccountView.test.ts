import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import AccountView from '@/views/AccountView.vue';
import { i18n, setAppLocale } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/router', () => ({
  currentPageTitle: { value: null as string | null },
}));

const routerPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

// happy-dom lacks localStorage, which the real auth store reads on init.
const memStore: Record<string, string> = {};
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in memStore ? memStore[k] : null),
    setItem: (k: string, v: string) => { memStore[k] = String(v); },
    removeItem: (k: string) => { delete memStore[k]; },
    clear: () => { for (const k of Object.keys(memStore)) delete memStore[k]; },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const mountView = async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAuthStore();
  store.user = { id: 'u1', email: 'demo@doschei.local', displayName: 'Demo User', language: 'en' };
  const wrapper = mount(AccountView, {
    global: {
      plugins: [pinia, i18n],
      stubs: { Teleport: true },
    },
  });
  await flushPromises();
  return wrapper;
};

describe('AccountView language selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppLocale('en');
    globalThis.localStorage?.clear();
  });

  it('switches locale immediately and persists via PATCH /auth/me', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: { user: { id: 'u1', email: 'demo@doschei.local', displayName: 'Demo User', language: 'it' } },
    });
    const wrapper = await mountView();

    await wrapper.find('[data-testid="account-language"]').setValue('it');
    expect(document.documentElement.lang).toBe('it');

    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/auth/me', { language: 'it' });
    expect(document.documentElement.lang).toBe('it');
    expect(wrapper.find('[data-testid="account-error"]').exists()).toBe(false);
  });

  it('reverts locale and shows the localized error when the PATCH fails', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('boom'));
    const wrapper = await mountView();

    await wrapper.find('[data-testid="account-language"]').setValue('it');
    await flushPromises();

    expect(document.documentElement.lang).toBe('en');
    expect(
      (wrapper.find('[data-testid="account-language"]').element as HTMLSelectElement).value,
    ).toBe('en');
    expect(wrapper.find('[data-testid="account-error"]').text()).toContain(
      'Could not save your changes',
    );
  });
});
