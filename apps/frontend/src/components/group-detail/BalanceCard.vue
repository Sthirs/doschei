<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatEur } from '@/lib/format';

import type { BalanceSummary } from '@/types/group';

defineProps<{ balance: BalanceSummary }>();

const { t, locale } = useI18n();

const showBreakdown = ref(false);
</script>

<template>
  <section class="balance-card sm:p-4 p-3">
    <div class="flex justify-between">
      <div
        :class="balance.perUser.length > 0 ? 'border-b border-white/10' : ''"
      >
        <p
          class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7] sm:block hidden"
        >
          {{ t('groupDetail.yourBalance') }}
        </p>
        <div
          :class="[
            'sm:mt-2 mt-0 flex items-center justify-between',
            balance.perUser.length > 0 ? 'mb-2' : '',
          ]"
        >
          <p
            v-if="balance.netForCurrentUser > 0"
            class="font-display text-2xl font-normal text-[#2ECC71]"
            style="line-height: 30px"
          >
            {{
              t('common.balanceOwed', {
                amount: formatEur(balance.netForCurrentUser, locale),
              })
            }}
          </p>
          <p
            v-else-if="balance.netForCurrentUser < 0"
            class="font-display text-2xl font-normal text-[#FFB4AB]"
            style="line-height: 30px"
          >
            {{
              t('common.balanceOwe', {
                amount: formatEur(Math.abs(balance.netForCurrentUser), locale),
              })
            }}
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
        v-if="balance.netForCurrentUser > 0"
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
        v-else-if="balance.netForCurrentUser < 0"
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
      v-if="balance.perUser.length > 0"
      type="button"
      class="mt-2 flex items-center gap-1 font-display text-sm font-normal text-[#C8C4D7] transition hover:text-[#E5E0ED]"
      @click="showBreakdown = !showBreakdown"
    >
      {{
        showBreakdown
          ? t('groupDetail.hideBreakdown')
          : t('groupDetail.seeBreakdown')
      }}
      <svg
        viewBox="0 0 24 24"
        class="h-4 w-4 fill-none stroke-current transition-transform"
        :class="showBreakdown ? 'rotate-180' : ''"
        stroke-width="2"
      >
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <!-- Breakdown list -->
    <ul
      v-if="showBreakdown && balance.perUser.length > 0"
      class="mt-2 flex flex-col gap-1.5"
    >
      <li
        v-for="entry in balance.perUser"
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
            entry.netForCurrentUser > 0 ? 'text-[#2ECC71]' : 'text-[#FFB4AB]'
          "
          class="font-semibold"
        >
          {{ formatEur(Math.abs(entry.netForCurrentUser), locale) }}
        </span>
      </li>
    </ul>
  </section>
</template>
