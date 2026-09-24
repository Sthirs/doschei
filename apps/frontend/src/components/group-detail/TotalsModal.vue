<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import MonthlyTotalsChart from '@/components/group-detail/MonthlyTotalsChart.vue';
import PeriodStepper from '@/components/group-detail/PeriodStepper.vue';
import SheetHeader from '@/components/SheetHeader.vue';
import { fromDateValue } from '@/lib/expenseDate';
import {
  aggregateMonthlyTotals,
  monthKeyOf,
  monthWindow,
  shiftMonthKey,
} from '@/lib/monthlyTotals';

import type { MonthKey } from '@/lib/monthlyTotals';
import type { Expense } from '@/types/group';

const props = defineProps<{ expenses: Expense[]; currentUserId: string }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();

// The window's rightmost (newest) month. It starts at the current month, so the
// default view is the current month plus the two before it.
const currentMonth = monthKeyOf(new Date());
const anchor = ref<MonthKey>(currentMonth);

const monthKeys = computed(() => monthWindow(anchor.value));
const months = computed(() =>
  aggregateMonthlyTotals(props.expenses, props.currentUserId, monthKeys.value),
);

// `YYYY-MM` compares correctly as a string, so no date parsing is needed to know
// whether the window may still move forward.
const canGoForward = computed(() => anchor.value < currentMonth);

const step = (delta: number) => {
  if (delta > 0 && !canGoForward.value) return;
  anchor.value = shiftMonthKey(anchor.value, delta);
};

// Built here rather than through an i18n template because the month names come
// from `toLocaleDateString`, the same way the expense list builds its headers.
const rangeLabel = computed(() => {
  const label = (monthKey: MonthKey) =>
    fromDateValue(`${monthKey}-01`).toLocaleDateString(locale.value, {
      month: 'short',
      year: 'numeric',
    });
  const keys = monthKeys.value;
  return `${label(keys[0])} – ${label(keys[keys.length - 1])}`;
});
</script>

<template>
  <!-- Header -->
  <SheetHeader :close-label="t('groupDetail.totalsClose')" @close="emit('close')">
    <h2 class="text-[18px] font-bold leading-7 tracking-[-0.45px] text-white">
      {{ t('groupDetail.totalsModalTitle') }}
    </h2>
  </SheetHeader>

  <!-- Chart -->
  <div class="px-5 pb-2 pt-4">
    <MonthlyTotalsChart :months="months" />
  </div>

  <!-- Period selector -->
  <div class="px-5 pt-3">
    <PeriodStepper
      :label="rangeLabel"
      label-test-id="totals-range"
      :previous-label="t('groupDetail.totalsPreviousPeriod')"
      :next-label="t('groupDetail.totalsNextPeriod')"
      :can-go-forward="canGoForward"
      @previous="step(-1)"
      @next="step(1)"
    />
  </div>
</template>
