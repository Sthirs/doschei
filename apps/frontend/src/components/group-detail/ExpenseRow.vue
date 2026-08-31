<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import { getCategory } from '@/lib/categories';
import { fromDateValue, getExpenseDateValue } from '@/lib/expenseDate';
import { formatEur } from '@/lib/format';

import type { Expense } from '@/types/group';

defineProps<{
  expense: Expense;
  /**
   * The signed amount this expense moves for the *current* user, computed by
   * the parent view. It is passed down rather than recomputed here so
   * `useAuthStore()` stays a single instantiation in `GroupDetailView.vue`
   * instead of one per rendered row.
   */
  net: number;
}>();

const { t, locale } = useI18n();

const itemLabel = (categoryKey: string): string =>
  t(`categories.items.${getCategory(categoryKey).key}`);

const categoryIconStyle = (categoryKey: string) => {
  const cat = getCategory(categoryKey);
  return {
    backgroundColor: `${cat.color}33`,
    border: `1px solid ${cat.color}4D`,
  };
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
</script>

<template>
  <li
    data-testid="expense-row"
    class="expense-row-card cursor-pointer transition hover:bg-white/5 p-[10px] sm:p-4"
  >
    <div class="flex items-center gap-3 sm:gap-4">
      <!-- Date badge -->
      <div
        class="flex w-8 h-10 shrink-0 flex-col items-center justify-center text-center"
      >
        <span
          class="text-[18px] font-normal text-[#E5E0ED]"
          style="line-height: 18px"
          >{{ formatDateShort(getExpenseDateValue(expense)).day }}</span
        >
        <span
          class="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8C4D7]"
          style="line-height: 15px"
          >{{ formatDateShort(getExpenseDateValue(expense)).monthShort }}</span
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
          {{
            t('groupDetail.settlementPaidPayee', {
              payer: expense.paidByName,
              payee: expense.settledWithName,
            })
          }}
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
          v-if="expense.kind !== 'SETTLEMENT' && net < 0"
          class="font-display text-[10px] font-semibold uppercase tracking-[-0.025em] text-[#FFB4AB]"
          style="line-height: 15px"
        >
          {{
            t('groupDetail.expenseYouOwe', {
              amount: formatEur(Math.abs(net), locale),
            })
          }}
        </span>
        <span
          v-else-if="expense.kind !== 'SETTLEMENT' && net > 0"
          class="font-display text-[10px] font-semibold uppercase tracking-[-0.025em] text-[#4BDDB7]"
          style="line-height: 15px"
        >
          {{
            t('groupDetail.expenseYouLent', { amount: formatEur(net, locale) })
          }}
        </span>
      </div>
    </div>
  </li>
</template>
