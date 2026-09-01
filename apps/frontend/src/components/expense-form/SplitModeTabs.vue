<script setup lang="ts">
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';

import { expenseSplitKey } from '@/composables/useExpenseSplit';

const split = inject(expenseSplitKey)!;

const { t } = useI18n();
</script>

<template>
  <div
    class="flex rounded-xl p-1"
    style="background: #201f27; border: 1px solid rgba(255, 255, 255, 0.08)"
  >
    <button
      type="button"
      class="flex-1 rounded-lg py-2 text-xs font-medium transition"
      :class="
        split.splitMode === 'EQUAL'
          ? 'bg-[#35343D] text-white'
          : 'hover:text-[#E5E0ED]'
      "
      :style="split.splitMode !== 'EQUAL' ? 'color: #C8C4D7' : ''"
      @click="split.splitMode = 'EQUAL'"
    >
      {{ t('expenseForm.splitModeEqual') }}
    </button>
    <button
      type="button"
      class="flex-1 rounded-lg py-2 text-xs font-medium transition"
      :class="
        split.splitMode === 'PERCENT'
          ? 'bg-[#35343D] text-white'
          : 'hover:text-[#E5E0ED]'
      "
      :style="split.splitMode !== 'PERCENT' ? 'color: #C8C4D7' : ''"
      @click="split.splitMode = 'PERCENT'"
    >
      {{ t('expenseForm.splitModePercent') }}
    </button>
    <button
      type="button"
      class="flex-1 rounded-lg py-2 text-xs font-medium transition"
      :class="
        split.splitMode === 'FIXED'
          ? 'bg-[#35343D] text-white'
          : 'hover:text-[#E5E0ED]'
      "
      :style="split.splitMode !== 'FIXED' ? 'color: #C8C4D7' : ''"
      @click="split.splitMode = 'FIXED'"
    >
      {{ t('expenseForm.splitModeFixed') }}
    </button>
  </div>
</template>
