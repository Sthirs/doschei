import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';

import ExpenseFormView from '@/views/ExpenseFormView.vue';
import { api } from '@/lib/api';
import { currentPageTitle } from '@/router';
import type { GroupDetail } from '@/types/group';

// The view imports `currentPageTitle` and `sharedGroup` from @/router. Mock
// the module: `currentPageTitle` with a real ref so the test can read what the
// component wrote to the topbar title lifecycle, and `sharedGroup` (hoisted so
// the vi.mock factory can reference it) to seed the group that would otherwise
// arrive via router history state.
const mocks = vi.hoisted(() => ({
  sharedGroup: { value: null as GroupDetail | null },
}));

vi.mock('@/router', () => ({
  currentPageTitle: ref<string | null>(null),
  sharedGroup: mocks.sharedGroup,
}));

// Mock the api module — the production api is an axios instance whose methods
// are not vi.fn's, so we replace it with a plain object of vi.fn's. Tests then
// configure each call with mockResolvedValue / mockResolvedValueOnce.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Auth store is not used by the view, but stub it so any transitive import
// that touches Pinia stores does not throw.
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

// Build a real vue-router instance with the same route names the production
// router uses (`expense-new`, `expense-edit`, `group-detail`). The view
// derives mode from `route.name` and reads `route.params.id` /
// `route.params.expenseId`, so a real router gives the most authentic
// behaviour while keeping tests isolated from the global router.
const buildRouter = async (initialPath: string): Promise<Router> => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/groups/:id/expenses/new',
        name: 'expense-new',
        component: ExpenseFormView,
        meta: { requiresAuth: true },
      },
      {
        path: '/groups/:id/expenses/:expenseId/edit',
        name: 'expense-edit',
        component: ExpenseFormView,
        meta: { requiresAuth: true },
      },
      {
        path: '/groups/:id',
        name: 'group-detail',
        meta: { requiresAuth: true },
        component: { template: '<div>group-detail</div>' },
      },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  return router;
};

const mountAt = async (path: string) => {
  const router = await buildRouter(path);
  const wrapper = mount(ExpenseFormView, {
    global: {
      plugins: [router],
      stubs: {
        Teleport: true,
        DateTimePicker: true,
        CategoryPicker: true,
      },
    },
  });
  // onMounted reads the group from the sharedGroup ref synchronously, then
  // runs initialise(). Flush the chain.
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
};

const makeMember = (id: string, name: string) => ({
  id,
  displayName: name,
  email: `${id}@test.com`,
});

const makeGroup = (overrides: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Test Group',
  imageUrl: null,
  memberCount: 2,
  members: [makeMember('user-1', 'Alice'), makeMember('user-2', 'Bob')],
  expenses: [],
  balance: {
    currentUserId: 'user-1',
    currentUserName: 'Alice',
    netForCurrentUser: 0,
    perUser: [],
  },
  ...overrides,
});

const makeExpense = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  kind: 'EXPENSE' as const,
  description: 'Old',
  amount: 50,
  category: 'general',
  paidByName: 'Alice',
  paidByUserId: 'user-1',
  settledWithUserId: null,
  settledWithName: null,
  date: '2026-01-15',
  createdAt: '2026-01-15T00:00:00.000Z',
  splits: [
    {
      userId: 'user-1',
      displayName: 'Alice',
      shareType: 'EQUAL' as const,
      shareValue: 0,
      computedAmount: 25,
    },
    {
      userId: 'user-2',
      displayName: 'Bob',
      shareType: 'EQUAL' as const,
      shareValue: 0,
      computedAmount: 25,
    },
  ],
  ...overrides,
});

describe('ExpenseFormView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPageTitle.value = null;
    // The view reads the group from the shared `sharedGroup` ref on mount
    // instead of fetching it. Seed it so the group is available; tests that
    // need different data override `mocks.sharedGroup.value` themselves.
    mocks.sharedGroup.value = makeGroup() as any;
    (api.post as unknown as { mockResolvedValue: (v: unknown) => unknown }).mockResolvedValue({
      data: {},
    });
    (api.patch as unknown as { mockResolvedValue: (v: unknown) => unknown }).mockResolvedValue({
      data: {},
    });
    (api.delete as unknown as { mockResolvedValue: (v: unknown) => unknown }).mockResolvedValue({
      data: {},
    });
  });

  it('create mode happy path: title set, form filled, post called, navigates to group-detail', async () => {
    const { wrapper, router } = await mountAt('/groups/g1/expenses/new');

    // currentPageTitle is set synchronously on mount (before the fetch).
    expect(currentPageTitle.value).toBe('Add Expense');

    // The amount container renders the € suffix.
    expect(wrapper.html()).toContain('\u20AC');

    // Fill amount + description.
    const numberInputs = wrapper.findAll('input[type="number"]');
    expect(numberInputs.length).toBeGreaterThan(0);
    await numberInputs[0].setValue('100');
    const textInputs = wrapper.findAll('input[type="text"]');
    expect(textInputs.length).toBeGreaterThan(0);
    await textInputs[0].setValue('Dinner');
    await wrapper.vm.$nextTick();

    // The split composable initializes with no members (group not yet loaded
    // at setup time), so no user is selected for split yet. Toggle one via
    // the exposed composable method to make isSplitValid() return true.
    const vm = wrapper.vm as unknown as {
      split: { toggleSplitUser: (id: string) => void };
    };
    vm.split.toggleSplitUser('user-2');
    await wrapper.vm.$nextTick();

    // Submit the form.
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.vm.$nextTick();
    // Router navigation is async — give it another flush.
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      '/groups/g1/expenses',
      expect.objectContaining({
        description: 'Dinner',
        amount: 100,
        paidByUserId: expect.any(String),
        splits: expect.any(Array),
      }),
    );
    expect(router.currentRoute.value.name).toBe('group-detail');
  });

  it('edit mode happy path: title set, description pre-filled, patch called, navigates to group-detail', async () => {
    mocks.sharedGroup.value = makeGroup({
      expenses: [makeExpense({ description: 'Old' })],
    }) as any;

    const { wrapper, router } = await mountAt('/groups/g1/expenses/e1/edit');

    expect(currentPageTitle.value).toBe('Edit Expense');

    // Description is pre-filled from the loaded expense.
    const textInputs = wrapper.findAll('input[type="text"]');
    expect((textInputs[0].element as HTMLInputElement).value).toBe('Old');

    // Edit mode DOES show the "Paid by" section — the label is rendered as a
    // <span> with that exact text, and member buttons are present.
    const paidByLabel = wrapper.findAll('span').find((s) => s.text() === 'Paid by');
    expect(paidByLabel).toBeDefined();
    // The Paid-by section renders a button per group member (2 members in test).
    const paidBySection = paidByLabel!.element.parentElement!;
    const paidByButtons = Array.from(paidBySection.querySelectorAll('button'));
    expect(paidByButtons.length).toBe(2);

    // Edit the description and submit.
    await textInputs[0].setValue('New');
    await wrapper.vm.$nextTick();

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith(
      '/groups/g1/expenses/e1',
      expect.objectContaining({
        description: 'New',
        paidByUserId: expect.any(String),
      }),
    );
    expect(router.currentRoute.value.name).toBe('group-detail');
  });

  it('validation failure path: empty amount → error message rendered, no api.post call', async () => {
    const { wrapper } = await mountAt('/groups/g1/expenses/new');

    // Fill only the description; leave amount empty.
    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('Dinner');
    await wrapper.vm.$nextTick();

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toContain(
      'Please provide a valid description and an amount greater than 0.',
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('edit 404 path: nonexistent expense → "Expense not found." + back-arrow still injected', async () => {
    mocks.sharedGroup.value = makeGroup({ expenses: [] }) as any;

    const { wrapper } = await mountAt('/groups/g1/expenses/nonexistent/edit');

    expect(wrapper.html()).toContain('Expense not found.');
    // The back-arrow lives in a <Teleport> at the top of the template, which
    // renders unconditionally regardless of loading / not-found / form state.
    expect(wrapper.html()).toContain('Back to group');
  });
});
