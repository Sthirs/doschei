import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';

import GroupDetailView from '@/views/GroupDetailView.vue';
import { i18n } from '@/i18n';
import { api } from '@/lib/api';

// The default group payload used by the mocked api.get. Declared as a hoisted
// function (not a const) so the vi.mock factory can call it even though vi.mock
// calls are hoisted above module-level const bindings.
function getDefaultGroup() {
  return {
    id: 'group-1',
    name: 'Test Group',
    imageUrl: null,
    memberCount: 3,
    members: [
      { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
      { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
      { id: 'user-3', displayName: 'Charlie', email: 'charlie@test.com' },
    ],
    expenses: [
      {
        id: 'settlement-1',
        kind: 'SETTLEMENT',
        description: 'Settlement',
        amount: 10,
        category: 'general',
        paidByName: 'Alice',
        paidByUserId: 'user-1',
        settledWithUserId: 'user-2',
        settledWithName: 'Bob',
        date: '2026-01-15',
        createdAt: '2026-01-15T00:00:00.000Z',
        splits: [
          {
            userId: 'user-2',
            displayName: 'Bob',
            shareType: 'FIXED',
            shareValue: 10,
            computedAmount: 10,
          },
        ],
      },
      {
        id: 'expense-1',
        kind: 'EXPENSE',
        description: 'Dinner',
        amount: 50,
        category: 'food',
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
            shareType: 'EQUAL',
            shareValue: 50,
            computedAmount: 25,
          },
          {
            userId: 'user-2',
            displayName: 'Bob',
            shareType: 'EQUAL',
            shareValue: 50,
            computedAmount: 25,
          },
        ],
      },
    ],
    balance: {
      currentUserId: 'user-1',
      currentUserName: 'Alice',
      netForCurrentUser: 0,
      perUser: [],
    },
  };
}

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { group: getDefaultGroup() } }),
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

// Mock the router module's currentPageTitle and sharedGroup
const mocks = vi.hoisted(() => ({
  sharedGroup: { value: null as any },
}));
vi.mock('@/router', () => ({
  currentPageTitle: ref('Test Group'),
  sharedGroup: mocks.sharedGroup,
}));

// Mock auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

const mountGroupDetailView = () =>
  mount(GroupDetailView, {
    global: {
      plugins: [i18n],
      stubs: {
        Teleport: true,
        DateTimePicker: true,
        UserPicker: true,
        CategoryPicker: true,
      },
    },
  });

// Queue the group payload returned by api.get for the next mount (loadGroup is
// called once on mount, so a single mockResolvedValueOnce is consumed).
const mockGroupResponse = (group: Record<string, unknown>) => {
  (api.get as unknown as { mockResolvedValueOnce: (value: unknown) => unknown }).mockResolvedValueOnce({
    data: { group },
  });
};

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
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Balance');
  });

  it('renders the expenses section', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Expenses');
  });

  it('renders settlement rows with payer paid payee format', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Alice paid Bob');
  });

  it('renders the Settle up button', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Settle Up');
  });

  it('EXPENSE rows still render Paid by format', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Paid by Alice');
  });

  // --- New tests for the Figma-aligned redesign ---

  it('renders the "Your Balance" label on the balance card', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Your Balance');
  });

  it('shows "You are owed" in green with an arrow when the balance is positive', async () => {
    mockGroupResponse({
      ...getDefaultGroup(),
      balance: { ...getDefaultGroup().balance, netForCurrentUser: 25 },
    });
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('You are owed');
    expect(html).toContain('\u20AC25.00');
    expect(html).toContain('text-[#2ECC71]');
    expect(html).toContain('bg-[#2ECC71]/20');
    expect(html).not.toContain('You owe');
  });

  it('shows "You owe" in coral with an arrow when the balance is negative', async () => {
    mockGroupResponse({
      ...getDefaultGroup(),
      balance: { ...getDefaultGroup().balance, netForCurrentUser: -10 },
    });
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('You owe');
    expect(html).toContain('\u20AC10.00');
    expect(html).toContain('text-[#FFB4AB]');
    expect(html).toContain('bg-[#FFB4AB]/20');
    expect(html).not.toContain('You are owed');
  });

  it('shows "Settled" in gray when the balance is zero', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Settled');
    expect(html).toContain('text-[#C8C4D7]');
    expect(html).not.toContain('You are owed');
    expect(html).not.toContain('You owe');
  });

  it('toggles the per-user breakdown when "See breakdown" is clicked', async () => {
    mockGroupResponse({
      ...getDefaultGroup(),
      balance: {
        ...getDefaultGroup().balance,
        perUser: [{ userId: 'user-2', displayName: 'Bob', netForCurrentUser: 10 }],
      },
    });
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toContain('See breakdown');
    expect(wrapper.html()).not.toContain('Bob owes you');

    const breakdownButton = wrapper.findAll('button').find((b) => b.text().includes('See breakdown'))!;
    await breakdownButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toContain('Hide breakdown');
    expect(wrapper.html()).toContain('Bob owes you');

    await breakdownButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toContain('See breakdown');
    expect(wrapper.html()).not.toContain('Bob owes you');
  });

  it('renders the export modal with month and year <select>s', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const exportButton = wrapper.findAll('button').find((b) => b.text().trim() === 'Export')!;
    await exportButton.trigger('click');
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Select Period');
    expect(html).toContain('Month');
    expect(html).toContain('Year');
    expect(html).toContain('Export Expenses');

    const selects = wrapper.findAll('select');
    expect(selects).toHaveLength(2);
    expect(selects[0].findAll('option')).toHaveLength(12);
    expect(selects[1].findAll('option')).toHaveLength(5);
  });

  it('renders YOU OWE / YOU LENT badges on expense rows', async () => {
    mockGroupResponse({
      ...getDefaultGroup(),
      expenses: [
        ...getDefaultGroup().expenses,
        {
          id: 'expense-2',
          kind: 'EXPENSE',
          description: 'Taxi',
          amount: 20,
          category: 'taxi',
          paidByName: 'Bob',
          paidByUserId: 'user-2',
          settledWithUserId: null,
          settledWithName: null,
          date: '2026-01-15',
          createdAt: '2026-01-15T00:00:00.000Z',
          splits: [
            {
              userId: 'user-2',
              displayName: 'Bob',
              shareType: 'EQUAL',
              shareValue: 10,
              computedAmount: 10,
            },
            {
              userId: 'user-1',
              displayName: 'Alice',
              shareType: 'EQUAL',
              shareValue: 10,
              computedAmount: 10,
            },
          ],
        },
      ],
    });
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('You lent \u20AC25.00');
    expect(html).toContain('You owe \u20AC10.00');
  });

  it('renders the bottom "+ Add expense" button', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('+ Add expense');

    const bottomButton = wrapper.findAll('button').find((b) => b.text().includes('+ Add expense'));
    expect(bottomButton).toBeTruthy();
  });

  it('navigates to expense-new when the bottom "+ Add expense" button is clicked', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const addButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('+ Add expense'))!;
    await addButton.trigger('click');

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'expense-new',
        params: { id: 'group-1' },
        state: expect.objectContaining({
          groupName: 'Test Group',
        }),
      }),
    );
  });

  it('navigates to settleup-new when the toolbar "Settle Up" button is clicked', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const settleUpButton = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Settle Up')!;
    await settleUpButton.trigger('click');

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'settleup-new',
        params: { id: 'group-1' },
        state: expect.objectContaining({
          groupName: 'Test Group',
        }),
      }),
    );
  });

  it('navigates to expense-edit when an EXPENSE row is clicked', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const dinnerRow = wrapper
      .findAll('.expense-row-card')
      .find((row) => row.text().includes('Dinner'))!;
    await dinnerRow.trigger('click');

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'expense-edit',
        params: { id: 'group-1', expenseId: 'expense-1' },
        state: expect.objectContaining({
          groupName: 'Test Group',
        }),
      }),
    );
  });

  it('navigates to settleup-edit when a SETTLEMENT row is clicked', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const settlementRow = wrapper
      .findAll('.expense-row-card')
      .find((row) => row.text().includes('Alice paid Bob'))!;
    await settlementRow.trigger('click');

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'settleup-edit',
        params: { id: 'group-1', sid: 'settlement-1' },
        state: expect.objectContaining({
          groupName: 'Test Group',
        }),
      }),
    );
  });

  it('navigates to the groups list when the back arrow is clicked', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    const backButton = wrapper
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Back to groups')!;
    await backButton.trigger('click');

    expect(mockRouterPush).toHaveBeenCalledWith({ name: 'groups' });
  });
});
