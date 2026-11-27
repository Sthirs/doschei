<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import ActionRow from '@/components/group-detail/ActionRow.vue';
import BalanceCard from '@/components/group-detail/BalanceCard.vue';
import ExpenseRow from '@/components/group-detail/ExpenseRow.vue';
import GroupDetailSheets from '@/components/group-detail/GroupDetailSheets.vue';
import StatusNotice from '@/components/StatusNotice.vue';
import TopbarBackButton from '@/components/group-detail/TopbarBackButton.vue';
import TopbarSettingsButtons from '@/components/group-detail/TopbarSettingsButtons.vue';
import { useCachedGroupDetail } from '@/composables/useGroupData';
import { useGroupDetailOverlays } from '@/composables/useGroupDetailOverlays';
import { goBackTo } from '@/lib/backNavigation';
import { fromDateValue, getExpenseDateValue } from '@/lib/expenseDate';
import { currentPageTitle } from '@/router';
import { useAuthStore } from '@/stores/auth';

import type { Expense } from '@/types/group';

const { t, locale } = useI18n();

const route = useRoute();
const router = useRouter();
// Instantiated ONCE for the whole view. `expenseNetForUser` stays here and its
// result is passed to each `<ExpenseRow>` as a prop, so the store is never
// re-instantiated per rendered row.
const authStore = useAuthStore();

const {
  showTotalsModal,
  openTotals,
  closeTotals,
  showExportModal,
  openExport,
  closeExport,
  showCategoryRecapModal,
  openCategoryRecap,
  closeCategoryRecap,
} = useGroupDetailOverlays();

const groupId = computed(() => route.params.id as string);
// ADR-0030: render the cached group at once and revalidate behind it. The
// expense and settle-up forms read the same cache entry.
const {
  data: group,
  isInitialLoading: isLoading,
  refreshFailed,
  blockingError,
} = useCachedGroupDetail(groupId);
const errorMessage = computed(() =>
  blockingError.value ? t('groupDetail.loadFailed') : '',
);
watch(
  () => group.value?.name,
  (name) => {
    if (name) currentPageTitle.value = name;
  },
  { immediate: true },
);

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

const goBack = () => {
  goBackTo(router, { name: 'groups' });
};

const navigateToExpenseNew = () => {
  router.push({
    name: 'expense-new',
    params: { id: groupId.value },
    state: { groupName: group.value?.name },
  });
};
const navigateToExpenseEdit = (expenseId: string) => {
  router.push({
    name: 'expense-edit',
    params: { id: groupId.value, expenseId },
    state: { groupName: group.value?.name },
  });
};
const navigateToSettleUpNew = () => {
  router.push({
    name: 'settleup-new',
    params: { id: groupId.value },
    state: { groupName: group.value?.name },
  });
};
const navigateToSettleUpEdit = (sid: string) => {
  router.push({
    name: 'settleup-edit',
    params: { id: groupId.value, sid },
    state: { groupName: group.value?.name },
  });
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

onMounted(() => {
  if (!group.value && history.state.groupName) {
    currentPageTitle.value = String(history.state.groupName);
  }
});

onBeforeUnmount(() => {
  currentPageTitle.value = null;
});
</script>

<template>
  <!-- Topbar: back arrow -->
  <TopbarBackButton @back="goBack" />

  <!-- Topbar: actions -->
  <TopbarSettingsButtons :group="group" :group-id="groupId" />

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
          <StatusNotice v-if="refreshFailed" :message="t('common.refreshFailed')" live />
          <!-- Balance summary card -->
          <BalanceCard v-if="group.balance" :balance="group.balance" />

          <!-- Action row -->
          <ActionRow
            :member-count="group.members.length"
            @settle-up="navigateToSettleUpNew()"
            @open-export="openExport"
            @open-totals="openTotals"
            @open-categories="openCategoryRecap"
          />
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
                <ExpenseRow
                  v-for="expense in monthGroup.expenses"
                  :key="expense.id"
                  :expense="expense"
                  :net="expenseNetForUser(expense)"
                  @click="
                    expense.kind === 'SETTLEMENT'
                      ? navigateToSettleUpEdit(expense.id)
                      : navigateToExpenseEdit(expense.id)
                  "
                />
              </ul>
            </template>
          </template>

          <div v-else class="py-5 text-[#C8C4D7]">
            {{ t('groupDetail.noExpenses') }}
          </div>
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

        <!-- Export, Totals and Category recap sheets -->
        <GroupDetailSheets
          :group="group"
          :group-id="groupId"
          :show-totals="showTotalsModal"
          :show-export="showExportModal"
          :show-categories="showCategoryRecapModal"
          @close-totals="closeTotals"
          @close-export="closeExport"
          @close-categories="closeCategoryRecap"
        />
      </template>

      <!-- Error -->
      <div
        v-if="errorMessage"
        class="flex-1 flex items-center justify-center px-4"
      >
        <StatusNotice :message="errorMessage" />
      </div>
    </div>
  </main>
</template>
