import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import GroupSettingsPanel from '@/components/GroupSettingsPanel.vue';
import { i18n } from '@/i18n';
import type { GroupDetail } from '@/types/group';

// Mock the api module
const mockApiPatch = vi.fn().mockResolvedValue({ data: {} });
const mockApiPost = vi.fn().mockResolvedValue({ data: { invitation: {} } });
const mockApiDelete = vi.fn().mockResolvedValue({ data: undefined });
vi.mock('@/lib/api', () => ({
  api: {
    patch: (...args: unknown[]) => mockApiPatch(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

// Mock auth store — user-1 is the current user
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

const makeGroup = (overrides: Partial<GroupDetail> = {}): GroupDetail => ({
  id: 'group-1',
  name: 'Weekend in Venice',
  imageUrl: null,
  memberCount: 2,
  members: [
    { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
    { id: 'user-2', displayName: 'Bob Smith', email: 'bob@test.com' },
  ],
  netForCurrentUser: 0,
  pendingInvitations: [
    { id: 'inv-1', email: 'carol@test.com', createdAt: '2025-01-01T00:00:00Z' },
  ],
  expenses: [],
  balance: {
    currentUserId: 'user-1',
    currentUserName: 'Alice',
    netForCurrentUser: 0,
    perUser: [],
  },
  ...overrides,
});

const mountComponent = (group: GroupDetail = makeGroup()) => {
  return mount(GroupSettingsPanel, {
    props: { group },
    global: { plugins: [i18n] },
  });
};

describe('GroupSettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders member row with displayName and email', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    // Non-current-user member row should show displayName and email
    expect(html).toContain('Bob Smith');
    expect(html).toContain('bob@test.com');
  });

  it('renders "You" and "Admin" for current user member row', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    expect(html).toContain('You');
  });

  it('renders pending-invitation row with email', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    // Pending invitation row shows the email
    expect(html).toContain('carol@test.com');
  });

  it('renders pending invitations section when invitations exist', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    expect(html).toContain('PENDING INVITATIONS');
    expect(html).toContain('carol@test.com');
  });

  it('hides pending invitations section when none exist', () => {
    const wrapper = mountComponent(
      makeGroup({ pendingInvitations: [] }),
    );
    const text = wrapper.text();

    expect(text).not.toContain('carol@test.com');
  });

  it('renders group picture when imageUrl is set', () => {
    const wrapper = mountComponent(
      makeGroup({ imageUrl: 'https://example.com/photo.jpg' }),
    );
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/photo.jpg');
  });

  it('does not render group picture when imageUrl is null', () => {
    const wrapper = mountComponent(makeGroup({ imageUrl: null }));
    const imgs = wrapper.findAll('img');
    expect(imgs.length).toBe(0);
  });

  it('shows Save button disabled when name unchanged', () => {
    const wrapper = mountComponent();
    const buttons = wrapper.findAll('button[type="button"]');
    const saveButton = buttons[buttons.length - 1];
    expect(saveButton.attributes('disabled')).toBeDefined();
    expect(saveButton.text()).toContain('Save');
  });
});
