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

// --- DOM-invariance lock ---
//
// GroupDetailView's <template> (lines 221-763) is the second-largest in the
// app and is slated for child-component extraction later in this plan (todos
// 23-24). This test freezes its rendered DOM for the default-mount state
// against a committed inline snapshot so any structural drift during that
// extraction is caught as an explicit, reviewable diff rather than
// discovered at e2e time or in production. It is NOT a substitute for the
// targeted e2e runs in todos 23-24 — those cover interaction/behaviour; this
// covers DOM structure only.
describe('GroupDetailView DOM-invariance snapshot', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    Object.defineProperty(window, 'history', {
      value: { state: {} },
      writable: true,
      configurable: true,
    });
    // Freeze "now" so the export-modal's default month/year (derived from
    // `new Date()`) can never vary the snapshot between runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-20T12:00:00.000Z'));
    // Force locale to 'en' regardless of the environment's navigator/storage
    // state so translated + toLocaleDateString-derived strings never vary
    // the snapshot.
    i18n.global.locale.value = 'en';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the exact committed DOM structure on default mount', async () => {
    const wrapper = mountGroupDetailView();

    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).toMatchInlineSnapshot(`
      "<!-- Topbar: back arrow -->
      <teleport-stub to="#topbar-leading"><button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED]" aria-label="Back to groups"><svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
            <path fill-rule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clip-rule="evenodd"></path>
          </svg></button></teleport-stub>
      <!-- Topbar: actions -->
      <teleport-stub to="#topbar-actions"><button type="button" class="hidden rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-[#E5E0ED] transition hover:border-white/20 hover:bg-white/5 sm:inline-flex">Settings</button><button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED] sm:hidden" aria-label="Toggle settings"><svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
            <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"></path>
          </svg></button></teleport-stub>
      <main class="flex flex-col flex-1 min-h-0 text-[#E5E0ED]">
        <div class="mx-auto w-full max-w-5xl flex flex-col flex-1 min-h-0">
          <!-- Loading -->
          <!-- Sticky header: balance + actions -->
          <div class="shrink-0 px-4 pt-3 pb-3 flex flex-col gap-3">
            <!-- Balance summary card -->
            <section class="balance-card sm:p-4 p-3">
              <div class="flex justify-between">
                <div class="">
                  <p class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7] sm:block hidden">Your Balance</p>
                  <div class="sm:mt-2 mt-0 flex items-center justify-between">
                    <p class="font-display text-2xl font-normal text-[#C8C4D7]" style="line-height: 30px;">Settled</p>
                  </div>
                </div><!-- Arrow icon -->
                <!--v-if-->
              </div><!-- Breakdown toggle -->
              <!--v-if-->
              <!-- Breakdown list -->
              <!--v-if-->
            </section><!-- Action row -->
            <div class="flex gap-2"><button type="button" class="rounded-xl bg-[#6554E7] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-white transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-40" title="Record a payment between members">Settle Up</button><button type="button" class="rounded-xl border border-white/[0.05] bg-[rgba(42,42,42,0.6)] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-[#C8C4D7] backdrop-blur-[4px] transition hover:bg-[rgba(42,42,42,0.8)]">Export</button><button type="button" class="rounded-xl border border-white/[0.05] bg-[rgba(42,42,42,0.6)] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-[#C8C4D7] backdrop-blur-[4px] transition hover:bg-[rgba(42,42,42,0.8)]">Totals</button></div>
          </div><!-- Scrollable: expenses list -->
          <div class="flex-1 overflow-y-auto px-4">
            <!-- Month header -->
            <p class="mt-2 text-xs font-semibold uppercase tracking-wide text-[#C8C4D7]">January 2026</p><!-- Expenses for this month -->
            <ul class="flex flex-col gap-2 py-2">
              <li data-testid="expense-row" class="expense-row-card cursor-pointer transition hover:bg-white/5 p-[10px] sm:p-4">
                <div class="flex items-center gap-3 sm:gap-4">
                  <!-- Date badge -->
                  <div class="flex w-8 h-10 shrink-0 flex-col items-center justify-center text-center"><span class="text-[18px] font-normal text-[#E5E0ED]" style="line-height: 18px;">15</span><span class="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8C4D7]" style="line-height: 15px;">JAN</span></div><!-- Category icon -->
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style="background-color: rgba(101, 84, 231, 0.2); border: 1px solid rgba(101, 84, 231, 0.3);" title="Settlement"><span aria-hidden="true" class="text-lg">🤝</span></div><!-- Title + paid-by -->
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-base font-normal text-[#E5E0ED]" style="line-height: 20px;">Settlement</p>
                    <p class="text-xs font-normal text-[#C8C4D7]" style="line-height: 18px;">Alice paid Bob</p>
                  </div><!-- Amount + badge -->
                  <div class="flex shrink-0 flex-col items-end gap-0.5"><span class="text-base font-normal text-[#E5E0ED]" style="line-height: 24px;">€10.00</span><!-- YOU OWE / YOU LENT badge (only for EXPENSE, not SETTLEMENT) -->
                    <!--v-if-->
                  </div>
                </div>
              </li>
              <li data-testid="expense-row" class="expense-row-card cursor-pointer transition hover:bg-white/5 p-[10px] sm:p-4">
                <div class="flex items-center gap-3 sm:gap-4">
                  <!-- Date badge -->
                  <div class="flex w-8 h-10 shrink-0 flex-col items-center justify-center text-center"><span class="text-[18px] font-normal text-[#E5E0ED]" style="line-height: 18px;">15</span><span class="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8C4D7]" style="line-height: 15px;">JAN</span></div><!-- Category icon -->
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style="background-color: #a3a3a333; border: 1px solid #a3a3a34D;" title="General"><img src="/icons/expenses/uncategorized/general.svg" alt="General" class="h-5 w-5" aria-hidden="true"></div><!-- Title + paid-by -->
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-base font-normal text-[#E5E0ED]" style="line-height: 20px;">Dinner</p>
                    <p class="text-xs font-normal text-[#C8C4D7]" style="line-height: 18px;">Paid by Alice</p>
                  </div><!-- Amount + badge -->
                  <div class="flex shrink-0 flex-col items-end gap-0.5"><span class="text-base font-normal text-[#E5E0ED]" style="line-height: 24px;">€50.00</span><!-- YOU OWE / YOU LENT badge (only for EXPENSE, not SETTLEMENT) --><span class="font-display text-[10px] font-semibold uppercase tracking-[-0.025em] text-[#4BDDB7]" style="line-height: 15px;">You lent €25.00</span></div>
                </div>
              </li>
            </ul>
          </div><!-- Sticky bottom: + Add expense button -->
          <div class="relative shrink-0 px-4">
            <!-- Gradient fade overlay above button -->
            <div class="absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-[#13121B] via-[#13121B]/50 to-transparent pointer-events-none"></div><button type="button" class="w-full mb-4 rounded-xl bg-[#6554E7] py-4 text-[18px] font-normal text-[#F0EBFF] transition hover:bg-[#5a44cf] active:scale-[0.98]" style="line-height: 27px;">+ Add expense</button>
          </div><!-- Export modal -->
          <!--v-if-->
          <!-- Totals modal -->
          <!--v-if-->
          <!-- Error -->
          <!--v-if-->
        </div>
      </main>"
    `);
  });
});
