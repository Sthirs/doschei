import { createPinia, setActivePinia } from 'pinia';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import {
  useSettleUpForm,
  type UseSettleUpFormReturn,
} from '@/composables/useSettleUpForm';
import { i18n } from '@/i18n';
import type { GroupDetail } from '@/types/group';
import { api } from '@/lib/api';
import { useGroupDataStore } from '@/stores/groupData';
import { seedGroupDetail } from './helpers/groupDataCache';

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
  seedGroupDetail(group);
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
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };
    mocks.route.query = {};
    mocks.push.mockReset();
    mocks.afterEachCallbacks.length = 0;
    mocks.historyBack = null;
    mocks.currentPageTitle.value = null;
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
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };
    mocks.route.query = {};
    mocks.push.mockReset();
    mocks.afterEachCallbacks.length = 0;
    mocks.historyBack = null;
    mocks.currentPageTitle.value = null;
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

  it('is invalid for an amount with more than two decimals, and says why', async () => {
    const { form } = await mountForm(makeGroup(-1));
    form.amountTouched.value = true;
    form.amount.value = 10.005;

    expect(form.isValid.value).toBe(false);
    expect(form.validationMessage.value).toBe(
      'Enter an amount with at most two decimals, up to 99,999,999.99.',
    );

    form.amount.value = 10.01;
    expect(form.isValid.value).toBe(true);
  });
});

// --- ADR-0030: the settle-up form reads the group data cache ---
describe('useSettleUpForm — group data cache (ADR-0030)', () => {
  const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
  const postMock = api.post as unknown as ReturnType<typeof vi.fn>;
  const patchMock = api.patch as unknown as ReturnType<typeof vi.fn>;
  const deleteMock = api.delete as unknown as ReturnType<typeof vi.fn>;

  const settlement = (id = 's1') => ({
    id,
    kind: 'SETTLEMENT' as const,
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
  });

  const withSettlement = () => ({ ...makeGroup(-1), expenses: [settlement()] });

  /** Mount the composable WITHOUT seeding (mountForm always seeds). */
  const mountCold = async () => {
    let form!: UseSettleUpFormReturn;
    const Host = defineComponent({
      setup() {
        form = useSettleUpForm();
        return () => h('div');
      },
    });
    mount(Host, { global: { plugins: [i18n] } });
    await flushPromises();
    return form;
  };

  const firstNavigationOrder = () =>
    Math.min(...mocks.back.mock.invocationCallOrder, ...mocks.replace.mock.invocationCallOrder);

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    getMock.mockReset();
    postMock.mockReset().mockResolvedValue({ data: {} });
    patchMock.mockReset().mockResolvedValue({ data: {} });
    deleteMock.mockReset().mockResolvedValue({ data: {} });
    mocks.route.name = 'settleup-new';
    mocks.route.params = { id: 'g1' };
    mocks.route.query = {};
    mocks.afterEachCallbacks.length = 0;
    mocks.historyBack = '/groups/g1';
  });

  it('cached group: zero GETs, and create defaults come from the cached balance', async () => {
    const { form } = await mountForm(makeGroup(-1));

    expect(getMock).not.toHaveBeenCalled();
    // Current user owes most to Bob (800) per the cached balance.
    expect(form.payerId.value).toBe('user-1');
    expect(form.payeeId.value).toBe('user-2');
    expect(form.amount.value).toBe(800);
  });

  // The balance a fetch returns after another member changed the group:
  // Bob is now owed 300 instead of 800.
  const updatedGroup = (): GroupDetail => {
    const g = makeGroup(-1);
    g.balance.perUser[0].netForCurrentUser = -300;
    g.balance.netForCurrentUser = -550;
    g.netForCurrentUser = -550;
    return g;
  };

  it.each([
    ['a stale', { stale: true }],
    ['an errored', { error: true }],
  ] as const)(
    '%s cached group is refetched and defaults come from the fresh balance',
    async (_label, flags) => {
      seedGroupDetail(makeGroup(-1));
      Object.assign(useGroupDataStore().details.g1, flags);
      getMock.mockResolvedValueOnce({ data: { group: updatedGroup() } });

      const form = await mountCold();

      expect(getMock).toHaveBeenCalledTimes(1);
      expect(form.payeeId.value).toBe('user-2');
      expect(form.amount.value).toBe(300);
    },
  );

  it('a stale cached group joins the in-flight revalidation (one GET)', async () => {
    seedGroupDetail(makeGroup(-1));
    const store = useGroupDataStore();
    store.invalidateGroup('g1');
    getMock.mockResolvedValueOnce({ data: { group: updatedGroup() } });
    // The detail view's revalidation, already running when the form mounts.
    const revalidation = store.fetchDetail('g1');

    const form = await mountCold();
    await revalidation;

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(form.amount.value).toBe(300);
  });

  it('cold deep link: one GET, then the form initialises and the cache is warm', async () => {
    getMock.mockResolvedValueOnce({ data: { group: makeGroup(-1) } });

    const form = await mountCold();

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/groups/g1');
    expect(form.group.value?.id).toBe('g1');
    expect(form.payeeId.value).toBe('user-2');
    expect(useGroupDataStore().cachedDetail('g1')).not.toBeNull();
  });

  it('cold deep link that fails sets loadError', async () => {
    getMock.mockRejectedValueOnce(new Error('offline'));

    const form = await mountCold();

    expect(form.loadError.value).toBe(true);
    expect(form.group.value).toBeNull();
  });

  it('edit: settlement missing from the cache is fetched fresh and found', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    getMock.mockResolvedValueOnce({ data: { group: withSettlement() } });

    const { form } = await mountForm(makeGroup(-1)); // cached, but no s1

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(form.notFound.value).toBe(false);
    expect(form.amount.value).toBe(42);
  });

  it('edit: still missing after the fresh fetch → notFound', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    getMock.mockResolvedValueOnce({ data: { group: makeGroup(-1) } });

    const { form } = await mountForm(makeGroup(-1));

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(form.notFound.value).toBe(true);
  });

  it('edit: settlement present in the cache → zero GETs', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };

    const { form } = await mountForm(withSettlement());

    expect(getMock).not.toHaveBeenCalled();
    expect(form.amount.value).toBe(42);
  });

  it('create success invalidates the group before navigating back', async () => {
    const { form } = await mountForm(makeGroup(-1));
    const store = useGroupDataStore();
    const invalidate = vi.spyOn(store, 'invalidateGroup');

    await form.submit();
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith('/groups/g1/settlements', expect.any(Object));
    expect(invalidate).toHaveBeenCalledWith('g1');
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(firstNavigationOrder());
    expect(store.details.g1.stale).toBe(true);
    expect(store.list.stale).toBe(true);
  });

  it('update success invalidates the group before navigating back', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    const { form } = await mountForm(withSettlement());
    const invalidate = vi.spyOn(useGroupDataStore(), 'invalidateGroup');

    await form.submit();
    await flushPromises();

    expect(patchMock).toHaveBeenCalledWith('/groups/g1/settlements/s1', expect.any(Object));
    expect(invalidate).toHaveBeenCalledWith('g1');
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(firstNavigationOrder());
  });

  it('delete success invalidates the group before navigating back', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    const { form } = await mountForm(withSettlement());
    const invalidate = vi.spyOn(useGroupDataStore(), 'invalidateGroup');

    await form.deleteSettlement();
    await flushPromises();

    expect(deleteMock).toHaveBeenCalledWith('/groups/g1/settlements/s1');
    expect(invalidate).toHaveBeenCalledWith('g1');
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(firstNavigationOrder());
  });

  it.each([
    ['create', 'settleup-new', postMock],
    ['update', 'settleup-edit', patchMock],
  ] as const)('a failed %s does not invalidate', async (_label, routeName, mock) => {
    mocks.route.name = routeName;
    mocks.route.params = { id: 'g1', sid: 's1' };
    mock.mockRejectedValueOnce(new Error('500'));
    const { form } = await mountForm(withSettlement());
    const store = useGroupDataStore();
    const invalidate = vi.spyOn(store, 'invalidateGroup');

    await form.submit();
    await flushPromises();

    expect(invalidate).not.toHaveBeenCalled();
    expect(store.details.g1.version).toBe(0);
    expect(form.errorMessage.value).not.toBe('');
  });

  it('a failed delete does not invalidate', async () => {
    mocks.route.name = 'settleup-edit';
    mocks.route.params = { id: 'g1', sid: 's1' };
    deleteMock.mockRejectedValueOnce(new Error('500'));
    const { form } = await mountForm(withSettlement());
    const invalidate = vi.spyOn(useGroupDataStore(), 'invalidateGroup');

    await form.deleteSettlement();
    await flushPromises();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('a background cache refresh does not overwrite a hand-edited amount', async () => {
    const { form } = await mountForm(makeGroup(-1));
    form.amount.value = 12.5;
    form.amountTouched.value = true;
    const store = useGroupDataStore();

    getMock.mockResolvedValueOnce({ data: { group: makeGroup(1) } });
    store.invalidateGroup('g1');
    await store.fetchDetail('g1');
    await flushPromises();

    expect(store.details.g1.data?.netForCurrentUser).toBe(1050);
    expect(form.amount.value).toBe(12.5);
    expect(form.payerId.value).toBe('user-1');
  });
});
