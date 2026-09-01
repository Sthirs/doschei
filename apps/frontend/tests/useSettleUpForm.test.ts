import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import {
  useSettleUpForm,
  type UseSettleUpFormReturn,
} from '@/composables/useSettleUpForm';
import { i18n } from '@/i18n';
import type { GroupDetail } from '@/types/group';

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

/**
 * Three members so the payer and the payee can each be changed on their own
 * while the other stays put — that is what pins BOTH entries of
 * `watch([payerId, payeeId])`. `netForCurrentUser` per counterpart is
 * deliberately different (800 vs 250) so a watcher that fails to fire leaves
 * an observably wrong amount rather than a coincidentally equal one.
 */
const makeGroup = (perUserSign: 1 | -1): GroupDetail => ({
  id: 'g1',
  name: 'Test Group',
  imageUrl: null,
  memberCount: 3,
  members: [
    { id: 'user-1', displayName: 'Alice', email: 'a@test.com', imageUrl: null },
    { id: 'user-2', displayName: 'Bob', email: 'b@test.com', imageUrl: null },
    { id: 'user-3', displayName: 'Cara', email: 'c@test.com', imageUrl: null },
  ],
  netForCurrentUser: 1050 * perUserSign,
  expenses: [],
  balance: {
    currentUserId: 'user-1',
    currentUserName: 'Alice',
    netForCurrentUser: 1050 * perUserSign,
    perUser: [
      {
        userId: 'user-2',
        displayName: 'Bob',
        netForCurrentUser: 800 * perUserSign,
      },
      {
        userId: 'user-3',
        displayName: 'Cara',
        netForCurrentUser: 250 * perUserSign,
      },
    ],
  },
});

const mountForm = async (group: GroupDetail) => {
  mocks.sharedGroup.value = group;
  let form!: UseSettleUpFormReturn;
  const Host = defineComponent({
    setup() {
      form = useSettleUpForm();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, { global: { plugins: [i18n] } });
  await flushPromises();
  return { form, wrapper };
};

describe('useSettleUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };
    mocks.push.mockReset();
    mocks.currentPageTitle.value = null;
    mocks.sharedGroup.value = null;
  });

  it('recomputes the amount when ONLY payeeId changes', async () => {
    // Current user owes both counterparts, so the defaults put the current
    // user in the payer slot and the largest debt in the payee slot.
    const { form } = await mountForm(makeGroup(-1));
    expect(form.payerId.value).toBe('user-1');
    expect(form.payeeId.value).toBe('user-2');
    expect(form.amount.value).toBe(800);

    form.payeeId.value = 'user-3';
    await flushPromises();

    expect(form.payerId.value).toBe('user-1');
    expect(form.amount.value).toBe(250);
  });

  it('recomputes the amount when ONLY payerId changes', async () => {
    // Both counterparts owe the current user, so the defaults put the largest
    // creditor in the payer slot and the current user in the payee slot.
    const { form } = await mountForm(makeGroup(1));
    expect(form.payerId.value).toBe('user-2');
    expect(form.payeeId.value).toBe('user-1');
    expect(form.amount.value).toBe(800);

    form.payerId.value = 'user-3';
    await flushPromises();

    expect(form.payeeId.value).toBe('user-1');
    expect(form.amount.value).toBe(250);
  });

  it('stops auto-computing once the amount has been touched by hand', async () => {
    const { form } = await mountForm(makeGroup(-1));
    form.amountTouched.value = true;
    form.amount.value = 42;

    form.payeeId.value = 'user-3';
    await flushPromises();

    expect(form.amount.value).toBe(42);
  });

  it('leaves the amount alone when neither party is the current user', async () => {
    const { form } = await mountForm(makeGroup(-1));

    form.payerId.value = 'user-2';
    form.payeeId.value = 'user-3';
    await flushPromises();

    expect(form.amount.value).toBe(800);
  });

  it('sets currentPageTitle on mount and clears it on unmount', async () => {
    const { wrapper } = await mountForm(makeGroup(-1));
    expect(mocks.currentPageTitle.value).toBe(
      i18n.global.t('settleUp.addTitle'),
    );

    wrapper.unmount();
    expect(mocks.currentPageTitle.value).toBeNull();
  });
});
