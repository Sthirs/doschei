<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { api } from '@/lib/api';
import { formatEur } from '@/lib/format';
import { getCategory } from '@/lib/categories';
import { currentPageTitle, sharedGroup } from '@/router';
import { useAuthStore } from '@/stores/auth';

import type { GroupDetail, Expense } from '@/types/group';

const { t, locale } = useI18n();

const itemLabel = (categoryKey: string): string =>
  t(`categories.items.${getCategory(categoryKey).key}`);
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const group = ref<GroupDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const showBreakdown = ref(false);

const groupId = computed(() => route.params.id as string);

// Export state
const now = new Date();
const exportMonthValue = ref(now.getMonth() + 1);
const exportYearValue = ref(now.getFullYear());
const exportMonth = computed(
  () =>
    `${exportYearValue.value}-${String(exportMonthValue.value).padStart(2, '0')}`,
);
const isExporting = ref(false);
const exportErrorMessage = ref('');
const showExportModal = ref(false);

const fromDateValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getExpenseDateValue = (expense: Expense) => {
  return expense.date || expense.createdAt.slice(0, 10);
};

const expenseNetForUser = (expense: Expense): number => {
  const currentUserId = authStore.user?.id;
  if (!currentUserId) return 0;
  if (expense.kind === 'SETTLEMENT') return 0;
  if (expense.paidByUserId === currentUserId) {
    const userSplit = expense.splits.find((s) => s.userId === currentUserId);
    const userShare = userSplit ? Number(userSplit.computedAmount) : 0;
    return expense.amount - userShare;
  }
  const userSplit = expense.splits.find((s) => s.userId === currentUserId);
  return userSplit ? -Number(userSplit.computedAmount) : 0;
};

const categoryIconStyle = (categoryKey: string) => {
  const cat = getCategory(categoryKey);
  return {
    backgroundColor: `${cat.color}33`,
    border: `1px solid ${cat.color}4D`,
  };
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
// `toLocaleDateString` is called with the active locale so Italian users see
// Italian month names ("gennaio", "febbraio", …).
const monthName = (m: number) =>
  new Date(2000, m - 1, 1).toLocaleDateString(locale.value, { month: 'long' });

const loadGroup = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const { data } = await api.get<{ group: GroupDetail }>(
      `/groups/${groupId.value}`,
    );
    group.value = data.group;
    currentPageTitle.value = data.group.name;
  } catch {
    errorMessage.value = t('groupDetail.loadFailed');
  } finally {
    isLoading.value = false;
  }
};

const goBack = () => {
  router.push({ name: 'groups' });
};

const navigateToExpenseNew = () => {
  sharedGroup.value = group.value;
  router.push({ name: 'expense-new', params: { id: groupId.value }, state: { groupName: group.value?.name } });
};
const navigateToExpenseEdit = (expenseId: string) => {
  sharedGroup.value = group.value;
  router.push({ name: 'expense-edit', params: { id: groupId.value, expenseId }, state: { groupName: group.value?.name } });
};
const navigateToSettleUpNew = () => {
  sharedGroup.value = group.value;
  router.push({ name: 'settleup-new', params: { id: groupId.value }, state: { groupName: group.value?.name } });
};
const navigateToSettleUpEdit = (sid: string) => {
  sharedGroup.value = group.value;
  router.push({ name: 'settleup-edit', params: { id: groupId.value, sid }, state: { groupName: group.value?.name } });
};

const formatDateShort = (dateStr: string) => {
  const date = fromDateValue(dateStr);
  return {
    monthShort: date
      .toLocaleDateString(locale.value, { month: 'short' })
      .toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
  };
};

const groupExpensesByMonth = computed(() => {
  if (!group.value?.expenses) return [];

  // Sort expenses by date descending (newest first)
  const sorted = [...group.value.expenses].sort(
    (a, b) =>
      fromDateValue(getExpenseDateValue(b)).getTime() -
      fromDateValue(getExpenseDateValue(a)).getTime(),
  );

  // Group by month/year
  const groups: Array<{
    monthYear: string;
    month: string;
    year: number;
    expenses: Expense[];
  }> = [];
  let currentMonth = '';
  let currentYear = 0;

  sorted.forEach((expense) => {
    const date = fromDateValue(getExpenseDateValue(expense));
    const month = date.toLocaleDateString(locale.value, { month: 'long' });
    const year = date.getFullYear();
    const monthYear = `${month} ${year}`;

    if (monthYear !== currentMonth || year !== currentYear) {
      currentMonth = monthYear;
      currentYear = year;
      groups.push({
        monthYear,
        month,
        year,
        expenses: [expense],
      });
    } else {
      groups[groups.length - 1].expenses.push(expense);
    }
  });

  return groups;
});

const exportCsv = async () => {
  if (!group.value) return;
  isExporting.value = true;
  exportErrorMessage.value = '';
  try {
    const token = localStorage.getItem('doschei.auth.token');
    const url = `/api/groups/${groupId.value}/expenses/export?month=${encodeURIComponent(exportMonth.value)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      exportErrorMessage.value = data.message ?? t('groupDetail.exportFailed');
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    const contentDisp = response.headers.get('content-disposition') ?? '';
    const filenameMatch = contentDisp.match(/filename\*?=(?:UTF-8''|")([^"]+)/);
    const filename = filenameMatch
      ? decodeURIComponent(filenameMatch[1])
      : `${group.value.name}-export.csv`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    showExportModal.value = false;
  } catch {
    exportErrorMessage.value = t('groupDetail.exportFailedTryAgain');
  } finally {
    isExporting.value = false;
  }
};

const groupSettingsTitle = (name: string): string =>
  t('groupDetail.settingsTitleSuffix', { name });

onMounted(() => {
  if (history.state.groupName) {
    currentPageTitle.value = groupSettingsTitle(String(history.state.groupName));
  }
  loadGroup();
});

onBeforeUnmount(() => {
  currentPageTitle.value = null;
});
</script>

<template>
  <!-- Topbar: back arrow -->
  <Teleport to="#topbar-leading">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED]"
      :aria-label="t('groupDetail.backToGroups')"
      @click="goBack"
    >
      <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
        <path
          fill-rule="evenodd"
          d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </Teleport>

  <!-- Topbar: actions -->
  <Teleport to="#topbar-actions">
    <button
      v-if="group"
      type="button"
      class="hidden rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-[#E5E0ED] transition hover:border-white/20 hover:bg-white/5 sm:inline-flex"
      @click="
        router.push({
          name: 'group-settings',
          params: { id: groupId },
          state: { groupName: group.name },
        })
      "
    >
      {{ t('groupDetail.settings') }}
    </button>
    <button
      v-if="group"
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED] sm:hidden"
      :aria-label="t('groupDetail.toggleSettings')"
      @click="
        router.push({
          name: 'group-settings',
          params: { id: groupId },
          state: { groupName: group.name },
        })
      "
    >
      <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
        <path
          fill-rule="evenodd"
          d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </Teleport>

  <main class="flex flex-col flex-1 min-h-0 text-[#E5E0ED]">
    <div class="mx-auto w-full max-w-5xl flex flex-col flex-1 min-h-0">
      <!-- Loading -->
      <div
        v-if="isLoading"
        class="flex-1 flex items-center justify-center text-[#C8C4D7]"
      >
        {{ t('groupDetail.loading') }}
      </div>

      <template v-else-if="group">
        <!-- Sticky header: balance + actions -->
        <div class="shrink-0 px-4 pt-3 pb-3 flex flex-col gap-3">
          <!-- Balance summary card -->
          <section v-if="group.balance" class="balance-card sm:p-4 p-3">
            <div class="flex justify-between">
              <div
                :class="
                  group.balance.perUser.length > 0
                    ? 'border-b border-white/10'
                    : ''
                "
              >
                <p
                  class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7] sm:block hidden"
                >
                  {{ t('groupDetail.yourBalance') }}
                </p>
                <div
                  :class="[
                    'sm:mt-2 mt-0 flex items-center justify-between',
                    group.balance.perUser.length > 0 ? 'mb-2' : '',
                  ]"
                >
                  <p
                    v-if="group.balance.netForCurrentUser > 0"
                    class="font-display text-2xl font-normal text-[#2ECC71]"
                    style="line-height: 30px"
                  >
                    {{ t('common.balanceOwed', { amount: formatEur(group.balance.netForCurrentUser, locale) }) }}
                  </p>
                  <p
                    v-else-if="group.balance.netForCurrentUser < 0"
                    class="font-display text-2xl font-normal text-[#FFB4AB]"
                    style="line-height: 30px"
                  >
                    {{ t('common.balanceOwe', { amount: formatEur(Math.abs(group.balance.netForCurrentUser), locale) }) }}
                  </p>
                  <p
                    v-else
                    class="font-display text-2xl font-normal text-[#C8C4D7]"
                    style="line-height: 30px"
                  >
                    {{ t('common.balanceSettled') }}
                  </p>
                </div>
              </div>
              <!-- Arrow icon -->
              <div
                v-if="group.balance.netForCurrentUser > 0"
                class="flex w-10 h-10 items-center justify-center rounded-full bg-[#2ECC71]/20"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5 fill-none stroke-[#2ECC71]"
                  stroke-width="2.5"
                >
                  <path
                    d="M7 17L17 7M17 7H8M17 7V16"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div
                v-else-if="group.balance.netForCurrentUser < 0"
                class="flex w-10 h-10 items-center justify-center rounded-full bg-[#FFB4AB]/20"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5 fill-none stroke-[#FFB4AB]"
                  stroke-width="2.5"
                >
                  <path
                    d="M7 7L17 17M17 17H8M17 17V8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
            </div>
            <!-- Breakdown toggle -->
            <button
              v-if="group.balance.perUser.length > 0"
              type="button"
              class="mt-2 flex items-center gap-1 font-display text-sm font-normal text-[#C8C4D7] transition hover:text-[#E5E0ED]"
              @click="showBreakdown = !showBreakdown"
            >
              {{ showBreakdown ? t('groupDetail.hideBreakdown') : t('groupDetail.seeBreakdown') }}
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4 fill-none stroke-current transition-transform"
                :class="showBreakdown ? 'rotate-180' : ''"
                stroke-width="2"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <!-- Breakdown list -->
            <ul
              v-if="showBreakdown && group.balance.perUser.length > 0"
              class="mt-2 flex flex-col gap-1.5"
            >
              <li
                v-for="entry in group.balance.perUser"
                :key="entry.userId"
                class="flex items-center justify-between text-sm pl-4"
              >
                <span class="text-[#C8C4D7]">
                  {{
                    entry.netForCurrentUser > 0
                      ? t('groupDetail.entryOwesYou', { name: entry.displayName })
                      : t('groupDetail.entryYouOwe', { name: entry.displayName })
                  }}
                </span>
                <span
                  :class="
                    entry.netForCurrentUser > 0
                      ? 'text-[#2ECC71]'
                      : 'text-[#FFB4AB]'
                  "
                  class="font-semibold"
                >
                  {{ formatEur(Math.abs(entry.netForCurrentUser), locale) }}
                </span>
              </li>
            </ul>
          </section>

          <!-- Action row -->
          <div class="flex gap-2">
          <button
            type="button"
            class="rounded-xl bg-[#6554E7] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-white transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="group.members.length < 2"
            :title="
              group.members.length < 2
                ? t('groupDetail.settleUpDisabledInviteTitle')
                : t('groupDetail.settleUpDisabledRecordTitle')
            "
            @click="navigateToSettleUpNew()"
          >
            {{ t('groupDetail.settleUp') }}
          </button>
            <button
              type="button"
              class="rounded-xl border border-white/[0.05] bg-[rgba(42,42,42,0.6)] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-[#C8C4D7] backdrop-blur-[4px] transition hover:bg-[rgba(42,42,42,0.8)]"
              @click="showExportModal = true"
            >
              {{ t('groupDetail.export') }}
            </button>
          </div>
        </div>

        <!-- Scrollable: expenses list -->
        <div class="flex-1 overflow-y-auto px-4">

          <template v-if="group.expenses.length > 0">
            <template
              v-for="monthGroup in groupExpensesByMonth"
              :key="monthGroup.monthYear"
            >
              <!-- Month header -->
              <p
                class="mt-2 text-xs font-semibold uppercase tracking-wide text-[#C8C4D7]"
              >
                {{ monthGroup.monthYear }}
              </p>

              <!-- Expenses for this month -->
              <ul class="flex flex-col gap-2 py-2">
                <li
                  v-for="expense in monthGroup.expenses"
                  :key="expense.id"
                  class="expense-row-card cursor-pointer transition hover:bg-white/5 p-[10px] sm:p-4"
                  @click="
                    expense.kind === 'SETTLEMENT'
                      ? navigateToSettleUpEdit(expense.id)
                      : navigateToExpenseEdit(expense.id)
                  "
                >
                  <div class="flex items-center gap-3 sm:gap-4">
                    <!-- Date badge -->
                    <div
                      class="flex w-8 h-10 shrink-0 flex-col items-center justify-center text-center"
                    >
                      <span
                        class="text-[18px] font-normal text-[#E5E0ED]"
                        style="line-height: 18px"
                        >{{
                          formatDateShort(getExpenseDateValue(expense)).day
                        }}</span
                      >
                      <span
                        class="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8C4D7]"
                        style="line-height: 15px"
                        >{{
                          formatDateShort(getExpenseDateValue(expense))
                            .monthShort
                        }}</span
                      >
                    </div>

                    <!-- Category icon -->
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      :style="
                        expense.kind === 'SETTLEMENT'
                          ? {
                              backgroundColor: 'rgba(101,84,231,0.2)',
                              border: '1px solid rgba(101,84,231,0.3)',
                            }
                          : categoryIconStyle(expense.category)
                      "
                      :title="
                        expense.kind === 'SETTLEMENT'
                          ? t('groupDetail.settlementTitle')
                          : itemLabel(expense.category)
                      "
                    >
                      <span
                        v-if="expense.kind === 'SETTLEMENT'"
                        aria-hidden="true"
                        class="text-lg"
                        >🤝</span
                      >
                      <img
                        v-else
                        :src="getCategory(expense.category).iconPath"
                        :alt="itemLabel(expense.category)"
                        class="h-5 w-5"
                        aria-hidden="true"
                      />
                    </div>

                    <!-- Title + paid-by -->
                    <div class="min-w-0 flex-1">
                      <p
                        class="truncate text-base font-normal text-[#E5E0ED]"
                        style="line-height: 20px"
                      >
                        {{ expense.description }}
                      </p>
                      <p
                        v-if="expense.kind === 'SETTLEMENT'"
                        class="text-xs font-normal text-[#C8C4D7]"
                        style="line-height: 18px"
                      >
                        {{ t('groupDetail.settlementPaidPayee', { payer: expense.paidByName, payee: expense.settledWithName }) }}
                      </p>
                      <p
                        v-else
                        class="text-xs font-normal text-[#C8C4D7]"
                        style="line-height: 18px"
                      >
                        {{ t('groupDetail.expensePaidBy', { name: expense.paidByName }) }}
                      </p>
                    </div>

                    <!-- Amount + badge -->
                    <div class="flex shrink-0 flex-col items-end gap-0.5">
                      <span
                        class="text-base font-normal text-[#E5E0ED]"
                        style="line-height: 24px"
                        >{{ formatEur(expense.amount, locale) }}</span
                      >
                      <!-- YOU OWE / YOU LENT badge (only for EXPENSE, not SETTLEMENT) -->
                      <span
                        v-if="
                          expense.kind !== 'SETTLEMENT' &&
                          expenseNetForUser(expense) < 0
                        "
                        class="font-display text-[10px] font-semibold uppercase tracking-[-0.025em] text-[#FFB4AB]"
                        style="line-height: 15px"
                      >
                        {{ t('groupDetail.expenseYouOwe', { amount: formatEur(Math.abs(expenseNetForUser(expense)), locale) }) }}
                      </span>
                      <span
                        v-else-if="
                          expense.kind !== 'SETTLEMENT' &&
                          expenseNetForUser(expense) > 0
                        "
                        class="font-display text-[10px] font-semibold uppercase tracking-[-0.025em] text-[#4BDDB7]"
                        style="line-height: 15px"
                      >
                        {{ t('groupDetail.expenseYouLent', { amount: formatEur(expenseNetForUser(expense), locale) }) }}
                      </span>
                    </div>
                  </div>
                </li>
              </ul>
            </template>
          </template>

          <div v-else class="py-5 text-[#C8C4D7]">{{ t('groupDetail.noExpenses') }}</div>
        </div>

        <!-- Sticky bottom: + Add expense button -->
        <div class="relative shrink-0 px-4">
          <!-- Gradient fade overlay above button -->
          <div
            class="absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-[#13121B] via-[#13121B]/50 to-transparent pointer-events-none"
          ></div>
          <button
            type="button"
            class="w-full mb-4 rounded-xl bg-[#6554E7] py-4 text-[18px] font-normal text-[#F0EBFF] transition hover:bg-[#5a44cf] active:scale-[0.98]"
            style="line-height: 27px"
            @click="navigateToExpenseNew()"
          >
            {{ t('groupDetail.addExpense') }}
          </button>
        </div>

        <!-- Export modal -->
        <div
          v-if="showExportModal"
          class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          @click.self="showExportModal = false"
        >
          <div
            class="w-full max-w-md rounded-t-2xl border border-[rgba(71,69,84,0.3)] bg-[#201F27] p-6 shadow-xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            :aria-label="t('groupDetail.exportModalTitle')"
          >
            <div class="flex items-start justify-between">
              <p
                class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
              >
                {{ t('groupDetail.selectPeriod') }}
              </p>
              <button
                type="button"
                class="text-[#C8C4D7] transition hover:text-[#E5E0ED]"
                :aria-label="t('common.close')"
                @click="showExportModal = false"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-5 w-5 fill-none stroke-current"
                  stroke-width="2"
                >
                  <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            <p class="mt-3 text-center text-lg font-semibold text-[#E5E0ED]">
              {{ monthName(exportMonthValue) }} {{ exportYearValue }}
            </p>
            <div class="mt-4 flex gap-3">
              <label class="flex-1 flex flex-col gap-1.5">
                <span
                  class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                  >{{ t('groupDetail.monthLabel') }}</span
                >
                <div class="relative">
                  <select
                    v-model.number="exportMonthValue"
                    class="w-full appearance-none rounded-xl border border-white/[0.05] bg-[#2A2932] py-3 pl-4 pr-10 text-sm text-[#E5E0ED] outline-none transition focus:border-brand-500/40"
                  >
                    <option v-for="m in MONTH_OPTIONS" :key="m" :value="m">
                      {{ monthName(m) }}
                    </option>
                  </select>
            <svg
                  viewBox="0 0 20 20"
                  class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#C8C4D7]"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                    clip-rule="evenodd"
                  />
                </svg>
                </div>
              </label>
              <label class="flex-1 flex flex-col gap-1.5">
                <span
                  class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
                  >{{ t('groupDetail.yearLabel') }}</span
                >
                <div class="relative">
                  <select
                    v-model.number="exportYearValue"
                    class="w-full appearance-none rounded-xl border border-white/[0.05] bg-[#2A2932] py-3 pl-4 pr-10 text-sm text-[#E5E0ED] outline-none transition focus:border-brand-500/40"
                  >
                    <option v-for="y in YEAR_OPTIONS" :key="y" :value="y">
                      {{ y }}
                    </option>
                  </select>
            <svg
                  viewBox="0 0 20 20"
                  class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#C8C4D7]"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                    clip-rule="evenodd"
                  />
                </svg>
                </div>
              </label>
            </div>
            <p
              v-if="exportErrorMessage"
              class="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              {{ exportErrorMessage }}
            </p>
            <button
              type="button"
              class="mt-4 w-full rounded-xl bg-[#6554E7] py-3 text-base font-normal text-[#F0EBFF] transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isExporting"
              @click="exportCsv"
            >
              <span
                v-if="isExporting"
                class="flex items-center justify-center gap-2"
              >
                <svg
                  class="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {{ t('groupDetail.exporting') }}
              </span>
              <span v-else>{{ t('groupDetail.exportExpenses') }}</span>
            </button>
            <button
              type="button"
              class="mt-2 w-full py-2 text-center text-sm text-[#C8C4D7] transition hover:text-[#E5E0ED]"
              @click="showExportModal = false"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </div>
      </template>

      <!-- Error -->
      <div
        v-if="errorMessage"
        class="flex-1 flex items-center justify-center px-4"
      >
        <p
          class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {{ errorMessage }}
        </p>
      </div>
    </div>
  </main>
</template>
