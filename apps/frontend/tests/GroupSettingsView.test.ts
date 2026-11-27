import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';

import GroupSettingsView from '@/views/GroupSettingsView.vue';
import { i18n } from '@/i18n';
import { api } from '@/lib/api';
import { currentPageTitle } from '@/router';
import { useGroupDataStore } from '@/stores/groupData';
import type { GroupDetail } from '@/types/group';
import { deferred, httpError, seedGroupDetail } from './helpers/groupDataCache';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/router', () => ({ currentPageTitle: ref<string | null>(null) }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'group-1' }, query: {} }),
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(() => Promise.resolve()),
    resolve: () => ({ fullPath: '/groups/group-1' }),
    afterEach: () => () => {},
    options: { history: { state: { back: null } } },
  }),
}));
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'user-1' }, token: 't', isAuthenticated: true }),
}));

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;
const patch = api.patch as unknown as ReturnType<typeof vi.fn>;
const del = api.delete as unknown as ReturnType<typeof vi.fn>;

const makeGroup = (overrides: Partial<GroupDetail> = {}): GroupDetail => ({
  id: 'group-1',
  name: 'Trip',
  imageUrl: null,
  memberCount: 2,
  members: [
    { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: null },
    { id: 'user-2', displayName: 'Bob Smith', email: 'bob@test.com', imageUrl: null },
  ],
  netForCurrentUser: 0,
  pendingInvitations: [{ id: 'inv-1', email: 'carol@test.com', createdAt: '2025-01-01' }],
  expenses: [],
  balance: { currentUserId: 'user-1', currentUserName: 'Alice', netForCurrentUser: 0, perUser: [] },
  ...overrides,
});

const mountView = () =>
  mount(GroupSettingsView, {
    global: { plugins: [i18n], stubs: { Teleport: true } },
  });

const detailGets = () => get.mock.calls.filter(([url]) => url === '/groups/group-1').length;

describe('GroupSettingsView — group data cache (ADR-0030)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    get.mockReset().mockResolvedValue({ data: { group: makeGroup() } });
    post.mockReset().mockResolvedValue({ data: { invitation: {} } });
    patch.mockReset().mockResolvedValue({ data: {} });
    del.mockReset().mockResolvedValue({ data: undefined });
    currentPageTitle.value = null;
    i18n.global.locale.value = 'en';
    Object.defineProperty(window, 'history', {
      value: { state: {} },
      writable: true,
      configurable: true,
    });
  });

  it('cached group renders the settings at once, never "Loading settings..."', async () => {
    seedGroupDetail(makeGroup());
    get.mockReturnValueOnce(new Promise(() => {}));

    const wrapper = mountView();

    expect(wrapper.text()).not.toContain('Loading settings');
    expect(wrapper.text()).toContain('Bob Smith');
    expect(currentPageTitle.value).toContain('Trip');
  });

  it('cold mount shows the loading state until the GET lands', async () => {
    const pending = deferred<unknown>();
    get.mockReturnValueOnce(pending.promise);

    const wrapper = mountView();
    expect(wrapper.text()).toContain('Loading settings');

    pending.resolve({ data: { group: makeGroup() } });
    await flushPromises();
    expect(wrapper.text()).toContain('Bob Smith');
  });

  it('rename → invalidates the group (and list) → one refetch → the new name shows', async () => {
    seedGroupDetail(makeGroup());
    const wrapper = mountView();
    await flushPromises();
    const store = useGroupDataStore();
    const invalidate = vi.spyOn(store, 'invalidateGroup');
    expect(detailGets()).toBe(1);

    get.mockResolvedValueOnce({ data: { group: makeGroup({ name: 'Renamed' }) } });
    await wrapper.find('input[type="text"]').setValue('Renamed');
    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click');
    await flushPromises();

    expect(patch).toHaveBeenCalledWith('/groups/group-1', { name: 'Renamed' });
    expect(invalidate).toHaveBeenCalledWith('group-1');
    expect(store.list.stale).toBe(true);
    expect(detailGets()).toBe(2);
    expect(currentPageTitle.value).toContain('Renamed');
    expect(store.cachedDetail('group-1')?.name).toBe('Renamed');
    // The panel stays mounted (no loading flash) across the refresh.
    expect(wrapper.text()).not.toContain('Loading settings');
  });

  it('add member → invalidate → one refetch', async () => {
    seedGroupDetail(makeGroup());
    const wrapper = mountView();
    await flushPromises();

    const email = wrapper.find('input[type="email"]');
    await email.setValue('dan@test.com');
    await wrapper.findAll('form').find((f) => f.find('input[type="email"]').exists())!.trigger('submit');
    await flushPromises();

    expect(post).toHaveBeenCalledWith('/groups/group-1/members', { email: 'dan@test.com' });
    expect(detailGets()).toBe(2);
  });

  it('remove member → invalidate → one refetch', async () => {
    seedGroupDetail(makeGroup());
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('button[aria-label="Remove member"]').trigger('click');
    await flushPromises();

    expect(del).toHaveBeenCalledWith('/groups/group-1/members/user-2');
    expect(detailGets()).toBe(2);
  });

  it('cancel invitation → invalidate → one refetch', async () => {
    seedGroupDetail(makeGroup());
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('button[aria-label="Cancel invitation"]').trigger('click');
    await flushPromises();

    expect(del).toHaveBeenCalledWith('/groups/group-1/invitations/inv-1');
    expect(detailGets()).toBe(2);
  });

  it('image upload → invalidate → one refetch', async () => {
    seedGroupDetail(makeGroup());
    const wrapper = mountView();
    await flushPromises();

    const input = wrapper.find('input[type="file"]');
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();

    expect(post).toHaveBeenCalledWith('/groups/group-1/image', expect.any(FormData));
    expect(detailGets()).toBe(2);
  });

  it('a failed mutation does not invalidate', async () => {
    seedGroupDetail(makeGroup());
    patch.mockRejectedValueOnce(httpError(500));
    const wrapper = mountView();
    await flushPromises();
    const invalidate = vi.spyOn(useGroupDataStore(), 'invalidateGroup');

    await wrapper.find('input[type="text"]').setValue('Nope');
    await wrapper.findAll('button').find((b) => b.text() === 'Save')!.trigger('click');
    await flushPromises();

    expect(invalidate).not.toHaveBeenCalled();
    expect(detailGets()).toBe(1);
  });

  it('a refetch 403 after removing yourself drops the group and shows the error, without crashing', async () => {
    seedGroupDetail(makeGroup());
    const wrapper = mountView();
    await flushPromises();

    get.mockRejectedValueOnce(httpError(403));
    useGroupDataStore().invalidateGroup('group-1');
    await flushPromises();

    expect(useGroupDataStore().cachedDetail('group-1')).toBeNull();
    expect(wrapper.text()).toContain('We could not load this group.');
    expect(wrapper.text()).not.toContain('Bob Smith');
  });

  it('a failed background refresh keeps the cached settings with the inline notice', async () => {
    seedGroupDetail(makeGroup());
    get.mockRejectedValueOnce(httpError(500));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Bob Smith');
    expect(wrapper.text()).toContain('Could not refresh. Showing the last loaded data.');
  });
});
