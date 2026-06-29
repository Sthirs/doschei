import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

import GroupDetailView from '@/views/GroupDetailView.vue';

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: {
        group: {
          id: 'group-1',
          name: 'Test Group',
          imageUrl: null,
          memberCount: 3,
          members: [
            { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
            { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
            { id: 'user-3', displayName: 'Charlie', email: 'charlie@test.com' },
          ],
          expenses: [],
          balance: {
            currentUserId: 'user-1',
            currentUserName: 'Alice',
            netForCurrentUser: 0,
            perUser: [],
          },
        },
      },
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock vue-router
const mockRouterPush = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: 'group-1' },
    meta: { requiresAuth: true },
  }),
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

// Mock the router module's currentPageTitle
vi.mock('@/router', () => ({
  currentPageTitle: ref('Test Group'),
}));

// Mock auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

describe('GroupDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Mock history.state to avoid null reference in happy-dom
    Object.defineProperty(window, 'history', {
      value: { state: {} },
      writable: true,
      configurable: true,
    });
  });

  it('renders the balance summary card', async () => {
    const wrapper = mount(GroupDetailView, {
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
          CategoryPicker: true,
        },
      },
    });

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Balance');
  });

  it('renders the expenses section', async () => {
    const wrapper = mount(GroupDetailView, {
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
          CategoryPicker: true,
        },
      },
    });

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Expenses');
  });
});
