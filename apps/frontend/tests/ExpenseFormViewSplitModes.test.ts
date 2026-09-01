import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';

import ExpenseFormView from '@/views/ExpenseFormView.vue';
import { i18n } from '@/i18n';
import { api } from '@/lib/api';
import type { GroupDetail } from '@/types/group';

const mocks = vi.hoisted(() => ({
  sharedGroup: { value: null as GroupDetail | null },
}));

vi.mock('@/router', () => ({
  currentPageTitle: ref<string | null>(null),
  sharedGroup: mocks.sharedGroup,
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const makeMember = (id: string, name: string) => ({
  id,
  displayName: name,
  email: `${id}@test.com`,
  imageUrl: null,
});

const makeExpense = () => ({
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
});

const makeGroup = () => ({
  id: 'g1',
  name: 'Test Group',
  imageUrl: null,
  memberCount: 2,
  members: [makeMember('user-1', 'Alice'), makeMember('user-2', 'Bob')],
  expenses: [makeExpense()],
  balance: {
    currentUserId: 'user-1',
    currentUserName: 'Alice',
    netForCurrentUser: 0,
    perUser: [],
  },
});

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/groups/:id/expenses/new',
        name: 'expense-new',
        component: ExpenseFormView,
      },
      {
        path: '/groups/:id/expenses/:expenseId/edit',
        name: 'expense-edit',
        component: ExpenseFormView,
      },
      {
        path: '/groups/:id',
        name: 'group-detail',
        component: { template: '<div>gd</div>' },
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(ExpenseFormView, {
    global: {
      plugins: [router, i18n],
      stubs: { Teleport: true, DateTimePicker: true, CategoryPicker: true },
    },
  });
  await flushPromises();
  return { wrapper, router };
};

describe('ExpenseFormView split modes and delete flow', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sharedGroup.value = makeGroup() as unknown as GroupDetail;
    (
      api.patch as never as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({ data: {} });
    (
      api.delete as never as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({ data: {} });
    i18n.global.locale.value = 'en';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('PERCENT mode: tab renders rows, inputs write through to split.percentValues, total updates', async () => {
    const { wrapper } = await mountAt('/groups/g1/expenses/e1/edit');
    const vm = wrapper.vm as unknown as {
      split: { splitMode: string; percentValues: Record<string, number | ''> };
    };

    const percentTab = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Percentage');
    await percentTab!.trigger('click');
    await flushPromises();

    expect(vm.split.splitMode).toBe('PERCENT');

    const rows = wrapper.findAll('div.flex.items-center.gap-2');
    expect(rows.length).toBe(2);
    expect(rows[0].text()).toContain('Alice');
    expect(rows[0].text()).toContain('%');

    const inputs = wrapper.findAll('input[type="number"][max="100"]');
    expect(inputs.length).toBe(2);
    await inputs[0].setValue('60');
    await inputs[1].setValue('40');
    await flushPromises();

    expect(vm.split.percentValues['user-1']).toBe(60);
    expect(vm.split.percentValues['user-2']).toBe(40);
    expect(wrapper.html()).toContain('Total: 100.0%');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('FIXED mode: tab renders rows, inputs write through to split.fixedValues, total updates', async () => {
    const { wrapper } = await mountAt('/groups/g1/expenses/e1/edit');
    const vm = wrapper.vm as unknown as {
      split: { splitMode: string; fixedValues: Record<string, number | ''> };
    };

    const fixedTab = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Fixed');
    await fixedTab!.trigger('click');
    await flushPromises();

    expect(vm.split.splitMode).toBe('FIXED');

    const inputs = wrapper.findAll('input[type="number"][step="0.01"]');
    // amount field + 2 fixed rows
    expect(inputs.length).toBe(3);
    await inputs[1].setValue('30');
    await inputs[2].setValue('20');
    await flushPromises();

    expect(vm.split.fixedValues['user-1']).toBe(30);
    expect(vm.split.fixedValues['user-2']).toBe(20);
    expect(wrapper.html()).toContain('50.00');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('EQUAL hint renders per-person amount', async () => {
    const { wrapper } = await mountAt('/groups/g1/expenses/e1/edit');
    expect(wrapper.html()).toContain('Each pays');
    expect(wrapper.html()).toContain('25.00');
  });

  it('delete flow: Delete → confirm panel → Confirm → api.delete + navigation', async () => {
    const { wrapper, router } = await mountAt('/groups/g1/expenses/e1/edit');

    const deleteBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Delete');
    expect(deleteBtn).toBeDefined();
    await deleteBtn!.trigger('click');
    await flushPromises();

    expect(wrapper.html()).toContain('Are you sure?');

    const cancelBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancel');
    await cancelBtn!.trigger('click');
    await flushPromises();
    expect(wrapper.html()).not.toContain('Are you sure?');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Delete')!
      .trigger('click');
    await flushPromises();
    const confirmBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm Delete');
    await confirmBtn!.trigger('click');
    await flushPromises();
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/groups/g1/expenses/e1');
    expect(router.currentRoute.value.name).toBe('group-detail');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
