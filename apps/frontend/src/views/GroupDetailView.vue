<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import BalanceCard from '@/components/group-detail/BalanceCard.vue';
import ExpenseRow from '@/components/group-detail/ExpenseRow.vue';
import ExportModal from '@/components/group-detail/ExportModal.vue';
import TopbarBackButton from '@/components/group-detail/TopbarBackButton.vue';
import TopbarSettingsButtons from '@/components/group-detail/TopbarSettingsButtons.vue';
import { api } from '@/lib/api';
import { fromDateValue, getExpenseDateValue } from '@/lib/expenseDate';
import { currentPageTitle, sharedGroup } from '@/router';
import { useAuthStore } from '@/stores/auth';

import type { GroupDetail, Expense } from '@/types/group';

const { t, locale } = useI18n();

const route = useRoute();
const router = useRouter();
// Instantiated ONCE for the whole view. `expenseNetForUser` stays here and its
// result is passed to each `<ExpenseRow>` as a prop, so the store is never
// re-instantiated per rendered row.
const authStore = useAuthStore();

const group = ref<GroupDetail | null>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const showExportModal = ref(false);

const groupId = computed(() => route.params.id as string);

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
  router.push({
    name: 'expense-new',
    params: { id: groupId.value },
    state: { groupName: group.value?.name },
  });
};
const navigateToExpenseEdit = (expenseId: string) => {
  sharedGroup.value = group.value;
  router.push({
    name: 'expense-edit',
    params: { id: groupId.value, expenseId },
    state: { groupName: group.value?.name },
  });
};
const navigateToSettleUpNew = () => {
  sharedGroup.value = group.value;
  router.push({
    name: 'settleup-new',
    params: { id: groupId.value },
    state: { groupName: group.value?.name },
  });
};
const navigateToSettleUpEdit = (sid: string) => {
  sharedGroup.value = group.value;
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

const groupSettingsTitle = (name: string): string =>
  t('groupDetail.settingsTitleSuffix', { name });

onMounted(() => {
  if (history.state.groupName) {
    currentPageTitle.value = groupSettingsTitle(
      String(history.state.groupName),
    );
  }
  loadGroup();
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
          <!-- Balance summary card -->
          <BalanceCard v-if="group.balance" :balance="group.balance" />

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

        <!-- Export modal -->
        <ExportModal
          v-if="showExportModal"
          :group-id="groupId"
          :group-name="group.name"
          @close="showExportModal = false"
        />
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
