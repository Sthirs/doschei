import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import SettleUpModal from '@/components/SettleUpModal.vue';
import { api } from '@/lib/api';
import type { BalanceSummary, Expense, GroupMember } from '@/types/group';

// Mock the api module (mirrors the pattern in GroupDetailView.test.ts:9-37).
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const members: GroupMember[] = [
  { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
  { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
];

const balanceOwing: BalanceSummary = {
  currentUserId: 'user-1',
  currentUserName: 'Alice',
  netForCurrentUser: -10,
  perUser: [{ userId: 'user-2', displayName: 'Bob', netForCurrentUser: -10 }],
};

const balanceOwed: BalanceSummary = {
  currentUserId: 'user-1',
  currentUserName: 'Alice',
  netForCurrentUser: 10,
  perUser: [{ userId: 'user-2', displayName: 'Bob', netForCurrentUser: 10 }],
};

// "All settled" — empty perUser so settlementAmountFor returns ''.
// Used for edit-mode tests so the watch on [payerId, payeeId] does not
// override the settlement's amount with a balance-derived value.
const balanceSettled: BalanceSummary = {
  currentUserId: 'user-1',
  currentUserName: 'Alice',
  netForCurrentUser: 0,
  perUser: [],
};

const settlement: Expense = {
  id: 'settlement-1',
  kind: 'SETTLEMENT',
  description: 'Settlement',
  amount: 12.34,
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
      shareValue: 12.34,
      computedAmount: 12.34,
    },
  ],
};

const findSubmitButton = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('button[type="submit"]');

const findAmountInput = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('input[type="number"]');

const waitForModalReady = async (wrapper: ReturnType<typeof mount>) => {
  // Two ticks: one for the initial mount flush, one for onMounted -> initialise().
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
};

describe('SettleUpModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders in create mode with pre-filled amount', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'create',
        groupId: 'test-group',
        members,
        balance: balanceOwing,
        currentUserId: 'user-1',
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    const amountInput = findAmountInput(wrapper);
    expect((amountInput.element as HTMLInputElement).value).toBe('10');
    expect(wrapper.html()).toContain('Settle up');
  });

  it('pre-fills payer as counterpart when the current user is owed', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'create',
        groupId: 'test-group',
        members,
        balance: balanceOwed,
        currentUserId: 'user-1',
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    // UserPicker is stubbed; the stub receives modelValue as a prop.
    // The first UserPicker in the template is the payer.
    const userPickers = wrapper.findAllComponents({ name: 'UserPicker' });
    expect(userPickers.length).toBeGreaterThanOrEqual(1);
    expect(userPickers[0]!.props('modelValue')).toBe('user-2');
  });

  it('calls api.post on submit in create mode', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'create',
        groupId: 'test-group',
        members,
        balance: balanceOwing,
        currentUserId: 'user-1',
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    await wrapper.find('form').trigger('submit');
    // Submit is async (await api.post). Flush the promise chain.
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.post).toHaveBeenCalledWith(
      '/groups/test-group/settlements',
      expect.objectContaining({
        paidByUserId: 'user-1',
        paidToUserId: 'user-2',
        amount: 10,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('disables submit button when payer equals payee', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'create',
        groupId: 'test-group',
        members,
        balance: balanceOwing,
        currentUserId: 'user-1',
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    // script setup exposes top-level bindings on the component proxy,
    // so the refs are reachable via wrapper.vm.
    const vm = wrapper.vm as unknown as { payerId: string; payeeId: string };
    vm.payerId = 'user-1';
    vm.payeeId = 'user-1';
    await wrapper.vm.$nextTick();

    const submitButton = findSubmitButton(wrapper);
    expect(submitButton.attributes('disabled')).toBeDefined();
  });

  it('preserves hand-typed amount when payee changes', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'create',
        groupId: 'test-group',
        members,
        balance: balanceOwing,
        currentUserId: 'user-1',
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    // Hand-type a new amount; @input sets amountTouched = true.
    const amountInput = findAmountInput(wrapper);
    await amountInput.setValue('25.50');

    // Now change the payee; the watch on [payerId, payeeId] would
    // re-prefill the amount, but amountTouched short-circuits it.
    const vm = wrapper.vm as unknown as { payerId: string; payeeId: string };
    vm.payeeId = 'user-2';
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect((findAmountInput(wrapper).element as HTMLInputElement).value).toBe('25.5');
  });

  it('renders in edit mode from settlement prop', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'edit',
        groupId: 'test-group',
        members,
        balance: balanceSettled,
        currentUserId: 'user-1',
        settlement,
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    expect(wrapper.html()).toContain('Record a Payment');
    expect((findAmountInput(wrapper).element as HTMLInputElement).value).toBe('12.34');
  });

  it('calls api.patch on submit in edit mode', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'edit',
        groupId: 'test-group',
        members,
        balance: balanceSettled,
        currentUserId: 'user-1',
        settlement,
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    await wrapper.find('form').trigger('submit');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.patch).toHaveBeenCalledWith(
      '/groups/test-group/settlements/settlement-1',
      expect.objectContaining({
        paidByUserId: 'user-1',
        paidToUserId: 'user-2',
        amount: 12.34,
        date: '2026-01-15',
      }),
    );
  });

  it('calls api.delete after confirmation in edit mode', async () => {
    const wrapper = mount(SettleUpModal, {
      props: {
        mode: 'edit',
        groupId: 'test-group',
        members,
        balance: balanceSettled,
        currentUserId: 'user-1',
        settlement,
      },
      global: {
        stubs: {
          Teleport: true,
          VueDatePicker: true,
          UserPicker: true,
        },
      },
    });

    await waitForModalReady(wrapper);

    // First Delete button: the one that opens the confirm panel.
    const allButtons = wrapper.findAll('button');
    const openConfirm = allButtons.find((b) => b.text().trim() === 'Delete this payment');
    expect(openConfirm).toBeDefined();
    await openConfirm!.trigger('click');
    await wrapper.vm.$nextTick();

    // After confirm opens, the second Delete is the confirm-panel one.
    // The Cancel button has different styling.
    const confirmButtons = wrapper.findAll('button');
    const confirmDelete = confirmButtons.find(
      (b) => b.text().trim() === 'Delete',
    );
    expect(confirmDelete).toBeDefined();
    await confirmDelete!.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.delete).toHaveBeenCalledWith(
      '/groups/test-group/settlements/settlement-1',
    );
  });
});
