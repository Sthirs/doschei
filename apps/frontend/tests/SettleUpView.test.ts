import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import SettleUpView from '@/views/SettleUpView.vue';
import { api } from '@/lib/api';
import type { Expense, GroupDetail } from '@/types/group';

// --- Mock state (hoisted so vi.mock factories can reference it) ---
const mocks = vi.hoisted(() => ({
  route: {
    name: 'settleup-new' as string,
    params: { id: 'g1' } as Record<string, string>,
  },
  push: vi.fn(),
  currentPageTitle: { value: null as string | null },
  sharedGroup: { value: null as GroupDetail | null },
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/router', () => ({
  currentPageTitle: mocks.currentPageTitle,
  sharedGroup: mocks.sharedGroup,
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

// --- Fixtures ---

function getDefaultGroup(): GroupDetail {
  return {
    id: 'g1',
    name: 'Test Group',
    imageUrl: null,
    memberCount: 2,
    members: [
      { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
      { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
    ],
    netForCurrentUser: 800,
    expenses: [],
    balance: {
      currentUserId: 'user-1',
      currentUserName: 'Alice',
      netForCurrentUser: 800,
      perUser: [
        { userId: 'user-2', displayName: 'Bob', netForCurrentUser: -800 },
      ],
    },
  };
}

const getSettlement = (overrides: Partial<Expense> = {}): Expense => ({
  id: 's1',
  kind: 'SETTLEMENT',
  description: 'Settlement',
  amount: 500,
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
      shareValue: 500,
      computedAmount: 500,
    },
  ],
  ...overrides,
});

// --- Mount helper ---

const mountView = async (group: GroupDetail) => {
  mocks.sharedGroup.value = group;
  const wrapper = mount(SettleUpView, {
    global: {
      stubs: {
        Teleport: true,
        DateTimePicker: true,
        UserPicker: true,
      },
    },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
  return wrapper;
};

const findButtonByText = (
  wrapper: ReturnType<typeof mount>,
  text: string,
) =>
  wrapper
    .findAll('button')
    .find((b) => b.text().trim() === text);

describe('SettleUpView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };
    mocks.push.mockReset();
    mocks.currentPageTitle.value = null;
    mocks.sharedGroup.value = null;
  });

  it('create mode: shows Record-a-Payment banner, amount card with €, and POSTs on submit → group-detail', async () => {
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };

    const wrapper = await mountView(getDefaultGroup());

    // Title was set synchronously on mount, before the fetch completed.
    expect(mocks.currentPageTitle.value).toBe('Settle Up');

    const html = wrapper.html();
    expect(html).toContain('Record a Payment');
    expect(html).toContain('€');
    // Amount card with placeholder "0.00"
    expect(html).toContain('placeholder="0.00"');

    const submitButton = findButtonByText(wrapper, '+ Record Payment');
    expect(submitButton).toBeDefined();
    expect(submitButton!.attributes('disabled')).toBeUndefined();

    // Trigger the form's submit event.
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/groups/g1/settlements',
      expect.objectContaining({
        paidByUserId: 'user-1',
        paidToUserId: 'user-2',
        amount: 800,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'group-detail' }),
    );
  });

  it('create mode: validation message and submit blocked when payer == payee', async () => {
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };

    const wrapper = await mountView(getDefaultGroup());

    // After mount, defaults populated: payer user-1, payee user-2, amount 800.
    // Force payer == payee to trigger the validation message.
    const vm = wrapper.vm as unknown as {
      payerId: string;
      payeeId: string;
    };
    vm.payerId = 'user-1';
    vm.payeeId = 'user-1';
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toContain(
      'The payer and the payee must be different people.',
    );

    const submitButton = wrapper.find('button[type="submit"]');
    expect(submitButton.attributes('disabled')).toBeDefined();

    // Even if we force-submit the form, the api.post is short-circuited.
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('edit mode: no banner, Edit Payment title, PATCHes on submit', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };

    const group = getDefaultGroup();
    group.expenses = [getSettlement()];

    const wrapper = await mountView(group);

    // Title set on mount, before the fetch completed.
    expect(mocks.currentPageTitle.value).toBe('Edit Payment');

    const html = wrapper.html();
    expect(html).not.toContain('Record a Payment');

    // Edit-mode-only controls are present.
    expect(html).toContain('Delete this payment');

    // Change amount to 600 and submit.
    const amountInput = wrapper.find('input[type="number"]');
    await amountInput.setValue('600');
    await wrapper.vm.$nextTick();

    const submitButton = findButtonByText(wrapper, '+ Record Payment');
    expect(submitButton).toBeDefined();
    expect(submitButton!.attributes('disabled')).toBeUndefined();

    // Trigger the form's submit event.
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith(
      '/groups/g1/settlements/s1',
      expect.objectContaining({
        paidByUserId: 'user-1',
        paidToUserId: 'user-2',
        amount: 600,
        date: '2026-01-15',
      }),
    );
    expect(api.post).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'group-detail' }),
    );
  });

  it('edit mode: delete happy path opens confirm panel and DELETEs → group-detail', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };

    const group = getDefaultGroup();
    group.expenses = [getSettlement()];

    const wrapper = await mountView(group);

    // Click "Delete this payment" → confirm panel appears.
    const openConfirm = findButtonByText(wrapper, 'Delete this payment');
    expect(openConfirm).toBeDefined();
    await openConfirm!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toContain('Delete payment?');
    expect(wrapper.html()).toContain('This action cannot be undone.');

    // The confirm-panel Delete button is the one with text exactly "Delete".
    const confirmDelete = findButtonByText(wrapper, 'Delete');
    expect(confirmDelete).toBeDefined();
    await confirmDelete!.trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/groups/g1/settlements/s1');
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'group-detail' }),
    );
  });
});
