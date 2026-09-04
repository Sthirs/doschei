<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import MonthlyTotalsChart from '@/components/group-detail/MonthlyTotalsChart.vue';
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
          <div
            class="flex items-center justify-between rounded-2xl bg-brand-900 p-1.5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]"
          >
            <button
              type="button"
              class="flex size-10 items-center justify-center rounded-xl text-[#9CA3AF] transition hover:bg-white/5 hover:text-[#E5E0ED]"
              :aria-label="t('groupDetail.totalsPreviousPeriod')"
              @click="step(-1)"
            >
              <!-- The chevron glyph the app already uses, turned to point left -->
              <svg
                viewBox="0 0 12 8"
                class="h-4 w-4 rotate-90 fill-none stroke-current"
                aria-hidden="true"
              >
                <path
                  d="M1 1l5 5 5-5"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <span class="flex items-center gap-2">
              <svg
                viewBox="0 0 16 17"
                class="h-3.5 w-3.5 shrink-0 fill-none stroke-current text-brand-500"
                aria-hidden="true"
              >
                <path
                  d="M4 1.5v2M12 1.5v2M1.5 6.5h13M3 3.5h10A1.5 1.5 0 0 1 14.5 5v9A1.5 1.5 0 0 1 13 15.5H3A1.5 1.5 0 0 1 1.5 14V5A1.5 1.5 0 0 1 3 3.5z"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span
                class="text-[12px] font-bold leading-4 tracking-[-0.3px] text-white"
                data-testid="totals-range"
              >
                {{ rangeLabel }}
              </span>
            </span>
            <button
              type="button"
              class="flex size-10 items-center justify-center rounded-xl text-[#9CA3AF] transition hover:bg-white/5 hover:text-[#E5E0ED] disabled:opacity-50 disabled:hover:bg-transparent"
              :disabled="!canGoForward"
              :aria-label="t('groupDetail.totalsNextPeriod')"
              @click="step(1)"
            >
              <svg
                viewBox="0 0 12 8"
                class="h-4 w-4 -rotate-90 fill-none stroke-current"
                aria-hidden="true"
              >
                <path
                  d="M1 1l5 5 5-5"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
