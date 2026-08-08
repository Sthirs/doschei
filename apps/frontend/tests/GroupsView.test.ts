import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import GroupsView from '@/views/GroupsView.vue';
import type { Group } from '@/types/group';

// Mock the api module
const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock vue-router
const mockRouterPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

// Mock the router module's currentPageTitle
const mockCurrentPageTitle = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/router', () => ({
  currentPageTitle: mockCurrentPageTitle,
}));

// Mock auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  id: 'group-1',
  name: 'Weekend in Venice',
  imageUrl: null,
  memberCount: 2,
  members: [
    { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
    { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
  ],
  netForCurrentUser: 0,
  ...overrides,
});

const mountComponent = async (groups: Group[] = []) => {
  mockApiGet.mockResolvedValue({ data: { groups } });
  const wrapper = mount(GroupsView);
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  return wrapper;
};

describe('GroupsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockCurrentPageTitle.value = null;
  });

  it('renders "You are owed" chip with € for positive net', async () => {
    const wrapper = await mountComponent([makeGroup({ netForCurrentUser: 40 })]);
    const html = wrapper.html();
    expect(html).toContain('You are owed');
    expect(html).toContain('€');
  });

  it('renders "You owe" chip for negative net', async () => {
    const wrapper = await mountComponent([makeGroup({ netForCurrentUser: -88 })]);
    const html = wrapper.html();
    expect(html).toContain('You owe');
  });

  it('renders "Settled" for zero net', async () => {
    const wrapper = await mountComponent([makeGroup({ netForCurrentUser: 0 })]);
    const html = wrapper.html();
    expect(html).toContain('Settled');
  });

  it('renders the "+ Create group" button', async () => {
    const wrapper = await mountComponent([makeGroup()]);
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('+ Create group');
  });

  it('renders 2 avatars for a group with 2 members', async () => {
    const wrapper = await mountComponent([
      makeGroup({
        members: [
          { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
          { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
        ],
      }),
    ]);
    const avatars = wrapper.findAll('[aria-label="Alice"], [aria-label="Bob"]');
    expect(avatars.length).toBe(2);
    const html = wrapper.html();
    expect(html).not.toMatch(/\+\d+/);
  });

  it('renders 3 avatars + "+2" badge for a group with 5 members', async () => {
    const members = [
      { id: 'u1', displayName: 'Alice', email: 'a@test.com' },
      { id: 'u2', displayName: 'Bob', email: 'b@test.com' },
      { id: 'u3', displayName: 'Charlie', email: 'c@test.com' },
      { id: 'u4', displayName: 'Dave', email: 'd@test.com' },
      { id: 'u5', displayName: 'Eve', email: 'e@test.com' },
    ];
    const wrapper = await mountComponent([makeGroup({ members, memberCount: 5 })]);
    // First 3 avatars visible
    const aliceAvatar = wrapper.find('[aria-label="Alice"]');
    const bobAvatar = wrapper.find('[aria-label="Bob"]');
    const charlieAvatar = wrapper.find('[aria-label="Charlie"]');
    expect(aliceAvatar.exists()).toBe(true);
    expect(bobAvatar.exists()).toBe(true);
    expect(charlieAvatar.exists()).toBe(true);
    // Dave and Eve not shown as individual avatars
    expect(wrapper.find('[aria-label="Dave"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Eve"]').exists()).toBe(false);
    // "+2" badge present
    expect(wrapper.html()).toContain('+2');
  });

  it('renders gradient initials thumbnail (no <img>) when imageUrl is null', async () => {
    const wrapper = await mountComponent([makeGroup({ imageUrl: null, name: 'Weekend in Venice' })]);
    // No <img> tag for this group
    const imgs = wrapper.findAll('img');
    expect(imgs.length).toBe(0);
    // Initials "WV" rendered
    expect(wrapper.html()).toContain('WV');
  });

  it('renders <img> tag when imageUrl is set', async () => {
    const wrapper = await mountComponent([
      makeGroup({ imageUrl: 'https://example.com/photo.jpg', name: 'Venice Trip' }),
    ]);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/photo.jpg');
  });

  it('sets currentPageTitle to "Do Schèi" on mount', async () => {
    await mountComponent([makeGroup()]);
    expect(mockCurrentPageTitle.value).toBe('Do Schèi');
  });
});
