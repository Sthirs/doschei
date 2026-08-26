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

const mountView = async (userOverrides: Partial<{ id: string; email: string; displayName: string; language: string; imageUrl: string | null }> = {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAuthStore();
  store.user = {
    id: 'u1',
    email: 'demo@doschei.local',
    displayName: 'Demo User',
    language: 'en',
    imageUrl: null,
    ...userOverrides,
  };
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
    const patchUser = { id: 'u1', email: 'demo@doschei.local', displayName: 'Demo User', language: 'it', imageUrl: null };
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
    const patchUser = { id: 'u1', email: 'demo@doschei.local', displayName: 'Nuovo Nome', language: 'it', imageUrl: null };
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

describe('AccountView avatar picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppLocale('en');
    globalThis.localStorage?.clear();
  });

  it('renders edit badge with edit.svg and correct aria-label', async () => {
    const wrapper = await mountView();
    const editBadge = wrapper.find('[data-testid="account-avatar-wrapper"] label');
    expect(editBadge.exists()).toBe(true);
    expect(editBadge.attributes('aria-label')).toBe('Change photo');
    const img = editBadge.find('img');
    const src = img.attributes('src');
    expect(src).toBeDefined();
    // Vite may inline SVG as data URL or serve as /icons/edit.svg
    expect(src === '/icons/edit.svg' || src?.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('shows user initial when no imageUrl', async () => {
    const wrapper = await mountView({ displayName: 'Demo User', imageUrl: null });
    const avatar = wrapper.find('[data-testid="account-avatar"]');
    expect(avatar.text()).toContain('D');
    expect(avatar.find('img').exists()).toBe(false);
  });

  it('shows image when imageUrl is present', async () => {
    const wrapper = await mountView({ displayName: 'Demo User', imageUrl: 'https://example.com/avatar.png' });
    const avatar = wrapper.find('[data-testid="account-avatar"]');
    const img = avatar.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/avatar.png');
    expect(img.classes()).toContain('object-cover');
  });

  it('dispatches change on hidden input and posts FormData to /auth/me/image', async () => {
    const updatedUser = { id: 'u1', email: 'demo@doschei.local', displayName: 'Demo User', language: 'en', imageUrl: 'https://example.com/new-avatar.png' };
    vi.mocked(api.post).mockResolvedValue({ data: { user: updatedUser } });

    const wrapper = await mountView();
    const fileInput = wrapper.find('#avatar-upload');
    expect(fileInput.exists()).toBe(true);
    expect(fileInput.attributes('accept')).toBe('image/*');
    expect(fileInput.attributes('capture')).toBeUndefined();

    const file = new File(['test'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', { value: [file] });

    await fileInput.trigger('change');
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(api.post).mock.calls[0];
    expect(callArgs[0]).toBe('/auth/me/image');
    expect(callArgs[1]).toBeInstanceOf(FormData);
    const formData = callArgs[1] as FormData;
    expect(formData.get('image')).toBe(file);
  });

  it('shows error for invalid file type', async () => {
    const wrapper = await mountView();
    const fileInput = wrapper.find('#avatar-upload');
    const file = new File(['test'], 'avatar.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput.element, 'files', { value: [file] });

    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.find('[data-testid="account-upload-error"]').text()).toContain('Please select a valid image file');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows error for file too large', async () => {
    const wrapper = await mountView();
    const fileInput = wrapper.find('#avatar-upload');
    const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', { value: [largeFile] });

    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.find('[data-testid="account-upload-error"]').text()).toContain('5 MB or smaller');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows generic error on upload failure', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network error'));
    const wrapper = await mountView();
    const fileInput = wrapper.find('#avatar-upload');
    const file = new File(['test'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', { value: [file] });

    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.find('[data-testid="account-upload-error"]').text()).toContain('Could not upload the photo');
  });

  it('shows uploading state during upload', async () => {
    let resolveUpload: (value: unknown) => void;
    const uploadPromise = new Promise((resolve) => { resolveUpload = resolve; });
    vi.mocked(api.post).mockReturnValue(uploadPromise as any);

    const wrapper = await mountView();
    const fileInput = wrapper.find('#avatar-upload');
    const file = new File(['test'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(fileInput.element, 'files', { value: [file] });

    await fileInput.trigger('change');

    expect(wrapper.find('[data-testid="account-uploading"]').text()).toContain('Uploading photo');
    expect(wrapper.find('[data-testid="account-upload-error"]').exists()).toBe(false);

    resolveUpload!({ data: { user: { id: 'u1', email: 'demo@doschei.local', displayName: 'Demo User', language: 'en', imageUrl: 'https://example.com/new.png' } } });
    await flushPromises();

    expect(wrapper.find('[data-testid="account-uploading"]').exists()).toBe(false);
  });
});

describe('AccountView version display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppLocale('en');
    globalThis.localStorage?.clear();
  });

  it('renders version from VITE_APP_VERSION env var', async () => {
    vi.stubEnv('VITE_APP_VERSION', '9.9.9');
    const wrapper = await mountView();
    const versionLine = wrapper.find('[data-testid="account-version"]');
    expect(versionLine.exists()).toBe(true);
    expect(versionLine.text()).toMatch(/Version 9\.9\.9/);
  });

  it('renders dev fallback when VITE_APP_VERSION is not set', async () => {
    vi.unstubAllEnvs();
    const wrapper = await mountView();
    const versionLine = wrapper.find('[data-testid="account-version"]');
    expect(versionLine.exists()).toBe(true);
    expect(versionLine.text()).toMatch(/Version dev/);
  });
});
