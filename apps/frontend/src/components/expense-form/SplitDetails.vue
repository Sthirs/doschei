<script setup lang="ts">
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatEur } from '@/lib/format';
import type { GroupDetail } from '@/types/group';
import SplitFixedRows from './SplitFixedRows.vue';
import SplitModeTabs from './SplitModeTabs.vue';
import SplitPercentRows from './SplitPercentRows.vue';
import { expenseSplitKey } from '@/composables/useExpenseSplit';

defineProps<{
  group: GroupDetail;
  amount: number | '';
  validationMessage: string;
}>();

const split = inject(expenseSplitKey)!;

const { t, locale } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-3">
    <SplitModeTabs />

    <!-- Equal hint -->
    <p
      v-if="split.splitMode === 'EQUAL' && amount && Number(amount) > 0"
      class="text-sm text-right"
      style="color: #c8c4d7"
    >
      {{
        t('expenseForm.eachPays', {
          amount: formatEur(split.equalSplitPerPerson(Number(amount)), locale),
        })
      }}
    </p>

    <!-- Percentage rows -->
    <SplitPercentRows v-if="split.splitMode === 'PERCENT'" :group="group" />

    <!-- Fixed rows -->
    <SplitFixedRows v-if="split.splitMode === 'FIXED'" :group="group" />

    <p v-if="validationMessage" class="text-sm" style="color: #ffb4ab">
      {{ validationMessage }}
    </p>
  </div>
</template>
