import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import {
  useSettleUpForm,
  type UseSettleUpFormReturn,
} from '@/composables/useSettleUpForm';
import { i18n } from '@/i18n';
import type { GroupDetail } from '@/types/group';

const mocks = vi.hoisted(() => {
  const afterEachCallbacks: Array<() => void> = [];
  return {
    route: {
      name: 'settleup-new' as string,
      params: { id: 'g1' } as Record<string, string>,
      // useSettleUpForm now calls useRoutedOverlay('delete') (ADR-0024),
      // which reads route.query — without this it throws on mount.
      query: {} as Record<string, string>,
    },
    push: vi.fn(),
    back: vi.fn(() => {
      queueMicrotask(() => afterEachCallbacks.forEach((cb) => cb()));
    }),
    replace: vi.fn(() => {
      queueMicrotask(() => afterEachCallbacks.forEach((cb) => cb()));
      return Promise.resolve(undefined);
    }),
    afterEachCallbacks,
    historyBack: null as string | null,
    currentPageTitle: { value: null as string | null },
    sharedGroup: { value: null as GroupDetail | null },
  };
});

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// `back`/`replace`/`afterEach`/`options.history.state` exist only because
// goBackTo and useRoutedOverlay (lib/backNavigation.ts,
// composables/useRoutedOverlay.ts — ADR-0024) are NOT mocked here and run for
// real against these. The afterEach-callback replay clears goBackTo's
// module-level `popPending` latch after each back()/replace(), the same way
// GroupDetailView.test.ts's router mock does — see the comment there.
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({
    push: mocks.push,
    back: mocks.back,
    replace: mocks.replace,
    resolve: (to: { name: string }) => ({
      fullPath: to.name === 'group-detail' ? '/groups/g1' : '/unknown',
    }),
    afterEach: (cb: () => void) => {
      mocks.afterEachCallbacks.push(cb);
      return () => {};
    },
    options: {
      history: {
        state: {
          get back() {
            return mocks.historyBack;
          },
        },
      },
    },
  }),
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
    mocks.route.query = {};
    mocks.push.mockReset();
    mocks.afterEachCallbacks.length = 0;
    mocks.historyBack = null;
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

  it('keeps the settlement own amount in edit mode, not the outstanding balance', async () => {
    // Outstanding balance with user-2 is 800, but the settlement being
    // edited was for 42 — a partial payment. The edit form must show 42.
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    const group = makeGroup(-1);
    group.expenses = [
      {
        id: 's1',
        kind: 'SETTLEMENT',
        description: '',
        amount: 42,
        category: '',
        paidByName: 'Alice',
        paidByUserId: 'user-1',
        settledWithUserId: 'user-2',
        settledWithName: 'Bob',
        date: '2024-01-01',
        createdAt: '2024-01-01',
        splits: [],
      },
    ];

    const { form } = await mountForm(group);

    expect(form.payerId.value).toBe('user-1');
    expect(form.payeeId.value).toBe('user-2');
    expect(form.amount.value).toBe(42);
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

// The save exit (`submit`) and the delete exit (`deleteSettlement`) both
// route through goBackTo (lib/backNavigation.ts, ADR-0024) via the shared
// `goToGroupDetail`/`goBack`. These assert the router call shape directly —
// this file's `route`/`router` mocks are static objects, so a pushed/replaced
// query never reflects back into `route.query` the way a real router would
// (see useRoutedOverlay.test.ts and GroupDetailOverlayRoutes.test.ts for that).
describe('useSettleUpForm — back navigation (ADR-0024)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };
    mocks.route.query = {};
    mocks.push.mockReset();
    mocks.afterEachCallbacks.length = 0;
    mocks.historyBack = null;
    mocks.currentPageTitle.value = null;
    mocks.sharedGroup.value = null;
  });

  it('save exit pops history when the previous entry already is group-detail', async () => {
    mocks.historyBack = '/groups/g1';
    const { form } = await mountForm(makeGroup(-1));

    await form.submit();
    await flushPromises();

    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('save exit replaces instead of popping when the previous entry is not group-detail', async () => {
    mocks.historyBack = null;
    const { form } = await mountForm(makeGroup(-1));

    await form.submit();
    await flushPromises();

    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'group-detail',
        params: { id: 'g1' },
      }),
    );
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('startDelete opens the delete overlay via a push, not a replace', async () => {
    const { form } = await mountForm(makeGroup(-1));

    form.startDelete();

    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ overlay: 'delete' }),
      }),
    );
  });

  it('deleteSettlement drops the overlay entry before popping back to group-detail', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    mocks.historyBack = '/groups/g1';
    const group = makeGroup(-1);
    group.expenses = [
      {
        id: 's1',
        kind: 'SETTLEMENT',
        description: '',
        amount: 42,
        category: '',
        paidByName: 'Alice',
        paidByUserId: 'user-1',
        settledWithUserId: 'user-2',
        settledWithName: 'Bob',
        date: '2024-01-01',
        createdAt: '2024-01-01',
        splits: [],
      },
    ];
    const { form } = await mountForm(group);

    await form.deleteSettlement();
    await flushPromises();

    // closeBeforeLeaving (useRoutedOverlay) always replaces — the overlay's
    // own entry points at the now-deleted settlement, so it must be dropped
    // rather than left for a future pop to land on.
    expect(mocks.replace).toHaveBeenCalled();
    // ...then goToGroupDetail pops, since the previous entry already is
    // group-detail.
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });
});
