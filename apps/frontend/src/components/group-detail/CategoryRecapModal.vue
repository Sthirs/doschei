<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import PeriodStepper from '@/components/group-detail/PeriodStepper.vue';
import SheetHeader from '@/components/SheetHeader.vue';
import { aggregateCategoryRecap } from '@/lib/categoryRecap';
import { CATEGORY_FAMILY_COLORS } from '@/lib/categories';
import { fromDateValue } from '@/lib/expenseDate';
import { formatEur, formatPercentTenths } from '@/lib/format';
import { monthKeyOf, shiftMonthKey } from '@/lib/monthlyTotals';

import type { MonthKey } from '@/lib/monthlyTotals';
import type { Expense } from '@/types/group';

const props = defineProps<{ expenses: Expense[]; currentUserId: string }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();

// A single month, unlike TotalsModal's three-month window (ADR-0026 §Decision).
// It starts at the current month, so the default view is "this month".
const currentMonth = monthKeyOf(new Date());
const anchor = ref<MonthKey>(currentMonth);

const recap = computed(() =>
  aggregateCategoryRecap(props.expenses, props.currentUserId, anchor.value),
);

// `YYYY-MM` compares correctly as a string, so no date parsing is needed to know
// whether the month may still move forward.
const canGoForward = computed(() => anchor.value < currentMonth);

const step = (delta: number) => {
  if (delta > 0 && !canGoForward.value) return;
  anchor.value = shiftMonthKey(anchor.value, delta);
};

const monthLabel = computed(() =>
  fromDateValue(`${anchor.value}-01`).toLocaleDateString(locale.value, {
    month: 'long',
    year: 'numeric',
  }),
);

// Plural selection uses `Intl.PluralRules` rather than vue-i18n's pipe syntax,
// matching how the rest of the app leaves pluralization to Intl (ADR-0018).
const summaryText = computed(() => {
  const { expenseCount: n, userCents } = recap.value;
  const share = formatEur(userCents / 100, locale.value);
  if (n === 0) return t('groupDetail.categoryRecapSummaryZero', { share });
  const rule = new Intl.PluralRules(locale.value).select(n);
  const key = rule === 'one' ? 'categoryRecapSummaryOne' : 'categoryRecapSummaryOther';
  return t(`groupDetail.${key}`, { n, share });
});
</script>

<template>
  <!-- Header -->
  <SheetHeader :close-label="t('groupDetail.categoryRecapClose')" @close="emit('close')">
    <h2 class="text-[18px] font-bold leading-7 tracking-[-0.45px] text-white">
      {{ t('groupDetail.categoryRecapTitle') }}
    </h2>
  </SheetHeader>

  <!-- Rows: always all seven families, in the same fixed family order
       every month (ADR-0026) -->
  <div class="flex flex-col gap-4 px-5 pb-2 pt-5">
    <div
      v-for="row in recap.rows"
      :key="row.family"
      data-testid="category-recap-row"
      :data-family="row.family"
      class="flex flex-col gap-2"
    >
      <div class="flex items-baseline justify-between gap-3">
        <span class="flex items-baseline gap-2.5">
          <span
            class="size-2 shrink-0 self-center rounded-full"
            :style="{ backgroundColor: CATEGORY_FAMILY_COLORS[row.family] }"
            aria-hidden="true"
          ></span>
          <span class="text-[16px] leading-6 text-[#E5E0ED]">
            {{ t(`categories.families.${row.family}`) }}
          </span>
          <span class="text-[12px] leading-4 tracking-[0.6px] text-[#C8C4D7]">
            {{ formatPercentTenths(row.shareTenths, locale) }}
          </span>
        </span>
        <span class="whitespace-nowrap text-[16px] font-semibold leading-6 text-white">
          {{ formatEur(row.cents / 100, locale) }}
        </span>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          class="h-full rounded-full"
          :style="{
            width: `${row.shareTenths / 10}%`,
            backgroundColor: CATEGORY_FAMILY_COLORS[row.family],
          }"
        ></div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div
    class="flex items-end justify-between border-t border-white/[0.06] px-5 pb-2 pt-4"
  >
    <div>
      <p class="text-[10px] uppercase leading-4 tracking-[1px] text-[#C8C4D7]">
        {{ t('groupDetail.categoryRecapTotalSpent') }}
      </p>
      <p
        class="text-[24px] font-bold leading-8 text-[#E5E0ED]"
        data-testid="category-recap-total"
      >
        {{ formatEur(recap.totalCents / 100, locale) }}
      </p>
    </div>
    <p
      class="text-[14px] leading-5 text-[#C8C4D7]"
      data-testid="category-recap-summary"
    >
      {{ summaryText }}
    </p>
  </div>

  <!-- Period selector -->
  <div class="px-5 pt-3">
    <PeriodStepper
      :label="monthLabel"
      label-test-id="category-recap-month"
      :previous-label="t('groupDetail.categoryRecapPreviousMonth')"
      :next-label="t('groupDetail.categoryRecapNextMonth')"
      :can-go-forward="canGoForward"
      @previous="step(-1)"
      @next="step(1)"
    />
  </div>
</template>
