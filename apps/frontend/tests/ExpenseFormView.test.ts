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

const mountAt = async (
  path: string,
  extraStubs: Record<string, unknown> = {},
) => {
  const router = await buildRouter(path);
  const wrapper = mount(ExpenseFormView, {
    global: {
      plugins: [router],
      stubs: {
        Teleport: true,
        DateTimePicker: true,
        CategoryPicker: true,
        ...extraStubs,
      },
    },
  });
  // onMounted reads the group from the sharedGroup ref synchronously, then
  // runs initialise(). Flush the chain.
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
};

// Custom CategoryPicker stub for the auto-selection tests. The default
// `CategoryPicker: true` stub is opaque: it renders an empty placeholder and
// gives us no way to read the bound `modelValue` or trigger an emit. This stub
// keeps the same public surface as the real picker (`modelValue` prop +
// `update:modelValue` emit) so we can assert on what the parent wrote and
// simulate a manual pick from the picker UI.
const CategoryPickerStub = {
  name: 'CategoryPickerStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div data-testid="category-picker-stub" />',
};

// Convenience: build a group whose expense history seeds the suggestion
// engine for `Venice train tickets` -> `bus-train`. Two exact-match entries
// give Stage 1 a dominant share of 1.0 (bestCount 2 of 2, runnerUp 0).
const makeGroupWithBusTrainHistory = () =>
  makeGroup({
    expenses: [
      makeExpense({
        id: 'hist-1',
        description: 'Venice train tickets',
        category: 'bus-train',
      }),
      makeExpense({
        id: 'hist-2',
        description: 'Venice train tickets',
        category: 'bus-train',
      }),
    ],
  });

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

describe('ExpenseFormView category auto-selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('create mode: typing a known description auto-picks the matching category after the debounce window', async () => {
    mocks.sharedGroup.value = makeGroupWithBusTrainHistory() as any;
    const { wrapper } = await mountAt(
      '/groups/g1/expenses/new',
      { CategoryPicker: CategoryPickerStub },
    );
    const picker = wrapper.findComponent(CategoryPickerStub);
    expect(picker.props('modelValue')).toBe('general');

    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('Venice train tickets');

    // Debounce window is 300ms — not yet fired.
    await vi.advanceTimersByTimeAsync(150);
    expect(picker.props('modelValue')).toBe('general');

    // After the full debounce the suggestion engine runs and the picker
    // reflects the silent auto-selection.
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(picker.props('modelValue')).toBe('bus-train');
  });

  it('create mode guard: a manual pick on the picker is preserved across subsequent description inputs', async () => {
    mocks.sharedGroup.value = makeGroupWithBusTrainHistory() as any;
    const { wrapper } = await mountAt(
      '/groups/g1/expenses/new',
      { CategoryPicker: CategoryPickerStub },
    );
    const picker = wrapper.findComponent(CategoryPickerStub);

    // Simulate the user picking a category from the picker: the parent v-model
    // setter runs and `onCategoryPicked` flips `categoryTouched` to true.
    picker.vm.$emit('update:modelValue', 'dining-out');
    await wrapper.vm.$nextTick();
    expect(picker.props('modelValue')).toBe('dining-out');

    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('Venice train tickets');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    // Manual selection wins — suggestion engine is blocked by categoryTouched.
    expect(picker.props('modelValue')).toBe('dining-out');
  });

  it('edit mode: stored non-default category is preserved through init and through typing', async () => {
    mocks.sharedGroup.value = makeGroup({
      expenses: [
        makeExpense({
          id: 'e-hotel',
          description: 'Hotel night',
          category: 'hotel',
        }),
      ],
    }) as any;
    const { wrapper } = await mountAt(
      '/groups/g1/expenses/e-hotel/edit',
      { CategoryPicker: CategoryPickerStub },
    );
    const picker = wrapper.findComponent(CategoryPickerStub);

    // Immediately after init the picker reflects the stored category with no
    // timer advance — loading the expense must never trigger a suggestion.
    expect(picker.props('modelValue')).toBe('hotel');

    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('Venice train tickets');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    // The default-slot guard rejects lookups when the current category is
    // anything other than `general`, so the stored value stays put.
    expect(picker.props('modelValue')).toBe('hotel');
  });

  it('gibberish description produces no suggestion: category stays at its current value', async () => {
    mocks.sharedGroup.value = makeGroupWithBusTrainHistory() as any;
    const { wrapper } = await mountAt(
      '/groups/g1/expenses/new',
      { CategoryPicker: CategoryPickerStub },
    );
    const picker = wrapper.findComponent(CategoryPickerStub);

    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('zzz qq');
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    // No fuzzy token overlap with the seeded corpus → suggestCategory returns
    // null → applySuggestion is a no-op → picker remains on the default.
    expect(picker.props('modelValue')).toBe('general');
  });

  it('unmount while a suggestion timer is pending does not log warnings or errors', async () => {
    mocks.sharedGroup.value = makeGroupWithBusTrainHistory() as any;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { wrapper } = await mountAt(
        '/groups/g1/expenses/new',
        { CategoryPicker: CategoryPickerStub },
      );
      const textInputs = wrapper.findAll('input[type="text"]');
      await textInputs[0].setValue('Venice train tickets');

      wrapper.unmount();
      // Push past the debounce window — if the timer were still pending the
      // callback would mutate state on an unmounted component and Vue would
      // warn. The onBeforeUnmount hook must have cleared it.
      await vi.advanceTimersByTimeAsync(500);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
