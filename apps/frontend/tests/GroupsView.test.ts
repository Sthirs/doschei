import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import GroupsView from '@/views/GroupsView.vue';
import { i18n } from '@/i18n';
import type { Group, InvitationListItem } from '@/types/group';

// Mock the api module
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
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
    { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: null },
    { id: 'user-2', displayName: 'Bob', email: 'bob@test.com', imageUrl: null },
  ],
  netForCurrentUser: 0,
  ...overrides,
});

const mountComponent = async (groups: Group[] = []) => {
  mockApiGet.mockResolvedValue({ data: { groups } });
  const wrapper = mount(GroupsView, { global: { plugins: [i18n] } });
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  return wrapper;
};

const mountWithInvitations = async (
  invitations: { id: string; groupId: string; groupName: string; inviterName: string; createdAt: string }[],
  groups: Group[] = [],
) => {
  mockApiGet.mockResolvedValue({ data: { groups, invitations } });
  const wrapper = mount(GroupsView, { global: { plugins: [i18n] } });
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  return wrapper;
};

describe('GroupsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockCurrentPageTitle.value = null;
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({ data: {} });
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
          { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: null },
          { id: 'user-2', displayName: 'Bob', email: 'bob@test.com', imageUrl: null },
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
      { id: 'u1', displayName: 'Alice', email: 'a@test.com', imageUrl: null },
      { id: 'u2', displayName: 'Bob', email: 'b@test.com', imageUrl: null },
      { id: 'u3', displayName: 'Charlie', email: 'c@test.com', imageUrl: null },
      { id: 'u4', displayName: 'Dave', email: 'd@test.com', imageUrl: null },
      { id: 'u5', displayName: 'Eve', email: 'e@test.com', imageUrl: null },
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

  it('img-branch wrapper has h-20 w-20 when imageUrl is set', async () => {
    const wrapper = await mountComponent([
      makeGroup({ imageUrl: 'https://example.com/photo.jpg', name: 'Venice Trip' }),
    ]);
    // Find the wrapper div that contains the img (the one with h-20 w-20 classes)
    const img = wrapper.find('img');
    const wrapperDiv = img.element.parentElement;
    expect(wrapperDiv).toBeTruthy();
    expect(wrapperDiv!.classList.contains('h-20')).toBe(true);
    expect(wrapperDiv!.classList.contains('w-20')).toBe(true);
    expect(wrapperDiv!.classList.contains('rounded-xl')).toBe(true);
    expect(wrapperDiv!.classList.contains('shrink-0')).toBe(true);
  });

  it('sets currentPageTitle to "Do Schèi" on mount', async () => {
    await mountComponent([makeGroup()]);
    expect(mockCurrentPageTitle.value).toBe('Do Schèi');
  });

  it('(F1) surfaces accept/decline errors inline on the matching invitation card', async () => {
    const invitation: InvitationListItem = {
      id: 'inv-1',
      groupId: 'group-A',
      groupName: 'Venice Trip',
      inviterName: 'Bob',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const wrapper = await mountWithInvitations([invitation]);
    const html = wrapper.html();
    expect(html).toContain('Venice Trip');
    expect(html).toContain('Invited by Bob');

    mockApiPost.mockRejectedValueOnce(new Error('network'));

    const buttons = wrapper.findAll('button');
    const acceptButton = buttons.find((b) => b.text().trim() === 'Accept');
    expect(acceptButton).toBeDefined();
    await acceptButton!.trigger('click');
    await wrapper.vm.$nextTick();
    await vi.dynamicImportSettled();

    expect(wrapper.html()).toContain('Could not accept the invitation');

    mockApiPost.mockRejectedValueOnce(new Error('network'));
    const declineButton = wrapper.findAll('button').find((b) => b.text().trim() === 'Decline');
    expect(declineButton).toBeDefined();
    await declineButton!.trigger('click');
    await wrapper.vm.$nextTick();
    await vi.dynamicImportSettled();

    expect(wrapper.html()).toContain('Could not decline the invitation');
  });

  it('renders member avatar with image when member has imageUrl', async () => {
    const wrapper = await mountComponent([
      makeGroup({
        members: [
          { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: 'https://example.com/alice.jpg' },
          { id: 'user-2', displayName: 'Bob', email: 'bob@test.com', imageUrl: null },
        ],
      }),
    ]);
    // First member has imageUrl - should render <img>
    const aliceAvatar = wrapper.find('[aria-label="Alice"]');
    expect(aliceAvatar.exists()).toBe(true);
    const img = aliceAvatar.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/alice.jpg');
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('aria-hidden')).toBe('true');
    expect(img.classes()).toContain('h-full');
    expect(img.classes()).toContain('w-full');
    expect(img.classes()).toContain('rounded-full');
    expect(img.classes()).toContain('object-cover');
    // Second member has no imageUrl - should render initials
    const bobAvatar = wrapper.find('[aria-label="Bob"]');
    expect(bobAvatar.exists()).toBe(true);
    expect(bobAvatar.find('img').exists()).toBe(false);
    expect(bobAvatar.text()).toContain('B');
  });

  it('renders member avatar initials when member has no imageUrl', async () => {
    const wrapper = await mountComponent([
      makeGroup({
        members: [
          { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: null },
          { id: 'user-2', displayName: 'Bob', email: 'bob@test.com', imageUrl: null },
        ],
      }),
    ]);
    const aliceAvatar = wrapper.find('[aria-label="Alice"]');
    expect(aliceAvatar.exists()).toBe(true);
    expect(aliceAvatar.find('img').exists()).toBe(false);
    expect(aliceAvatar.text()).toContain('A');

    const bobAvatar = wrapper.find('[aria-label="Bob"]');
    expect(bobAvatar.exists()).toBe(true);
    expect(bobAvatar.find('img').exists()).toBe(false);
    expect(bobAvatar.text()).toContain('B');
  });
});
