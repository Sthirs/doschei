<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import MonthlyTotalsChart from '@/components/group-detail/MonthlyTotalsChart.vue';
import PeriodStepper from '@/components/group-detail/PeriodStepper.vue';
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
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <!-- Scrim -->
      <div
        class="absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-[2px]"
        @click="emit('close')"
      ></div>
      <!-- Bottom sheet on phones, centred popup from sm: up -->
      <div
        class="relative w-full max-w-[390px] rounded-t-[24px] border-t border-white/10 bg-[#1C1B25] pb-6 shadow-[0_-12px_20px_rgba(0,0,0,0.6)] sm:rounded-[24px] sm:border sm:pb-5 sm:shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
        role="dialog"
        aria-modal="true"
        :aria-label="t('groupDetail.totalsModalTitle')"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between border-b border-white/[0.06] px-5 pb-[17px] pt-5"
        >
          <h2
            class="text-[18px] font-bold leading-7 tracking-[-0.45px] text-white"
          >
            {{ t('groupDetail.totalsModalTitle') }}
          </h2>
          <button
            type="button"
            class="flex size-9 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED]"
            :aria-label="t('groupDetail.totalsClose')"
            @click="emit('close')"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-5 w-5 fill-none stroke-current"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
            </svg>
          </button>
        </div>

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
      </div>
    </div>
  </Teleport>
</template>
