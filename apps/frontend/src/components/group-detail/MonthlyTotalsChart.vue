<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { fromDateValue } from '@/lib/expenseDate';
import { formatEur, formatEurAxis, formatEurWhole } from '@/lib/format';
import { niceAxis } from '@/lib/monthlyTotals';

import type { MonthlyTotal } from '@/lib/monthlyTotals';

const props = defineProps<{ months: MonthlyTotal[] }>();

const { t, locale } = useI18n();

// Height of the plotting area in pixels, i.e. the baseline-to-axis-top distance.
// Kept in sync with the `h-[180px] … bottom-5` geometry of the template below,
// and used only to decide whether a segment is tall enough to hold its label.
const PLOT_PX = 180 - 20;
// A value label needs about this much vertical room to sit legibly inside its
// segment; below that the segment keeps its colour and drops the label, the way
// the design already hides the group segment's own label.
const MIN_LABEL_PX = 16;

const axis = computed(() =>
  niceAxis(Math.max(0, ...props.months.map((month) => month.groupCents))),
);

const bars = computed(() =>
  props.months.map((month) => {
    const heightPct = (month.groupCents / axis.value.maxCents) * 100;
    const userPct = month.groupCents
      ? (month.userCents / month.groupCents) * 100
      : 0;
    const userPx = (heightPct / 100) * PLOT_PX * (userPct / 100);
    return {
      ...month,
      heightPct,
      userPct,
      showUserLabel: userPx >= MIN_LABEL_PX,
      shortMonth: fromDateValue(`${month.monthKey}-01`).toLocaleDateString(
        locale.value,
        { month: 'short' },
      ),
    };
  }),
);

const periodTotalCents = computed(() =>
  props.months.reduce((sum, month) => sum + month.groupCents, 0),
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Title and legend -->
    <div class="flex items-center justify-between">
      <div class="flex flex-col gap-[1.5px] pt-[5.5px]">
        <span
          class="text-[11px] font-semibold uppercase leading-[16.5px] tracking-[0.55px] text-[#9CA3AF]"
        >
          {{ t('groupDetail.totalsComparisonLabel') }}
        </span>
        <span class="text-[12px] font-medium leading-4 text-[#D1D5DB]">
          {{ t('groupDetail.totalsChartSubtitle') }}
        </span>
      </div>
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="size-2 shrink-0 rounded-full bg-[#6554E7]"></span>
          <span class="text-[10px] leading-[15px] text-[#9CA3AF]">
            {{ t('groupDetail.totalsLegendYou') }}
          </span>
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-2 shrink-0 rounded-full bg-[#343144]"></span>
          <span class="text-[10px] leading-[15px] text-[#9CA3AF]">
            {{ t('groupDetail.totalsLegendGroup') }}
          </span>
        </span>
      </div>
    </div>

    <!-- Chart. The top padding is the overflow room a full-height bar's value
         label needs, so it must not be removed. -->
    <div class="flex flex-col px-1 pt-5">
      <div class="flex h-[180px] items-start">
        <!-- Y axis -->
        <div
          class="flex h-full w-10 flex-col items-end justify-between pb-5 pr-2.5"
        >
          <span
            v-for="(tick, index) in axis.tickCents"
            :key="tick"
            class="font-mono text-[10px] leading-[15px]"
            :class="
              index === axis.tickCents.length - 1
                ? 'font-bold text-[#9CA3AF]'
                : 'text-[#6B7280]'
            "
          >
            {{ formatEurAxis(tick, locale) }}
          </span>
        </div>

        <div class="relative h-full flex-1">
          <!-- Gridlines, the last one being the baseline the bars sit on -->
          <div
            class="absolute inset-x-0 bottom-5 top-0 flex flex-col justify-between"
          >
            <span
              class="h-px border-t border-dashed border-white/[0.08]"
            ></span>
            <span
              class="h-px border-t border-dashed border-white/[0.08]"
            ></span>
            <span
              class="h-px border-t border-dashed border-white/[0.08]"
            ></span>
            <span class="h-px border-t border-white/20"></span>
          </div>

          <!-- Stacked bars -->
          <div
            class="absolute inset-x-0 bottom-5 top-0 flex items-end justify-around px-2"
          >
            <div
              v-for="bar in bars"
              :key="bar.monthKey"
              class="flex h-full w-12 flex-col items-center justify-end"
              data-testid="totals-bar"
              :data-month="bar.monthKey"
            >
              <span
                class="pb-1 text-[10px] font-semibold leading-[15px] tracking-[-0.25px] text-[#D1D5DB]"
                data-testid="totals-bar-group"
              >
                {{ formatEurWhole(bar.groupCents, locale) }}
              </span>
              <div
                v-if="bar.groupCents > 0"
                class="flex w-full flex-col overflow-hidden rounded-b rounded-t-lg border border-white/10 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]"
                :style="{ height: `${bar.heightPct}%` }"
              >
                <span class="min-h-0 flex-1 bg-[#343144]"></span>
                <span
                  class="flex shrink-0 items-center justify-center bg-[#6554E7] shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]"
                  :style="{ height: `${bar.userPct}%` }"
                >
                  <span
                    v-if="bar.showUserLabel"
                    class="text-[9px] font-bold leading-[13.5px] tracking-[-0.45px] text-white"
                    data-testid="totals-bar-user"
                  >
                    {{ formatEurWhole(bar.userCents, locale) }}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Month names, offset by the y-axis width so they line up under bars -->
      <div class="flex items-start justify-center pl-10 pr-2 pt-1">
        <span
          v-for="bar in bars"
          :key="bar.monthKey"
          class="w-1/3 pb-[2.5px] pt-[5.5px] text-center text-[12px] font-medium leading-4 text-[#9CA3AF]"
        >
          {{ bar.shortMonth }}
        </span>
      </div>
    </div>

    <!-- Period total -->
    <div
      class="flex items-center justify-between border-t border-white/[0.06] px-1 pt-[13px]"
    >
      <span class="text-[12px] leading-4 text-[#9CA3AF]">
        {{ t('groupDetail.totalsPeriodTotal') }}
      </span>
      <span
        class="text-[12px] font-bold leading-4 tracking-[-0.3px] text-white"
        data-testid="totals-period-total"
      >
        {{ formatEur(periodTotalCents / 100, locale) }}
      </span>
    </div>
  </div>
</template>
