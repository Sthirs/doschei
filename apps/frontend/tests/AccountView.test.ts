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

  it('does not PATCH while selecting; persists only when Save is pressed and applies the locale then', async () => {
    const patchUser = { id: 'u1', email: 'demo@doschei.local', displayName: 'Demo User', language: 'it' };
    vi.mocked(api.patch).mockResolvedValue({ data: { user: patchUser } });
    const wrapper = await mountView();

    await wrapper.find('[data-testid="account-language"]').setValue('it');
    expect(api.patch).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe('en');

    await wrapper.find('[data-testid="account-save"]').trigger('click');
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith('/auth/me', { language: 'it' });

    await flushPromises();
    expect(document.documentElement.lang).toBe('it');
  });

  it('sends displayName and language together when both changed', async () => {
    const patchUser = { id: 'u1', email: 'demo@doschei.local', displayName: 'Nuovo Nome', language: 'it' };
    vi.mocked(api.patch).mockResolvedValue({ data: { user: patchUser } });
    const wrapper = await mountView();

    await wrapper.find('#account-name').setValue('Nuovo Nome');
    await wrapper.find('[data-testid="account-language"]').setValue('it');
    await wrapper.find('[data-testid="account-save"]').trigger('click');

    expect(api.patch).toHaveBeenCalledWith('/auth/me', {
      displayName: 'Nuovo Nome',
      language: 'it',
    });
  });

  it('on failed Save the locale stays unchanged and the error is shown', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('boom'));
    const wrapper = await mountView();

    await wrapper.find('[data-testid="account-language"]').setValue('it');
    await wrapper.find('[data-testid="account-save"]').trigger('click');
    await flushPromises();

    expect(document.documentElement.lang).toBe('en');
    expect(wrapper.find('[data-testid="account-error"]').text()).toContain(
      'Could not save your changes',
    );
  });

  it('Save stays disabled until something changed', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="account-save"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="account-language"]').setValue('it');
    expect(wrapper.find('[data-testid="account-save"]').attributes('disabled')).toBeUndefined();
  });
});
