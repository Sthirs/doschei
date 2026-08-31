<script setup lang="ts">
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';

import type { GroupDetail } from '@/types/group';
import { expenseSplitKey } from '@/composables/useExpenseSplit';

defineProps<{ group: GroupDetail }>();

const split = inject(expenseSplitKey)!;

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="userId in split.selectedSplitUserIds"
      :key="userId"
      class="flex items-center gap-2"
    >
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
        style="color: #c6bfff"
      >
        <img
          v-if="group.members.find((m) => m.id === userId)?.imageUrl"
          :src="
            group.members.find((m) => m.id === userId)!.imageUrl ?? undefined
          "
          alt=""
          aria-hidden="true"
          class="h-full w-full rounded-full object-cover"
        />
        <span v-else>
          {{
            group.members
              .find((m) => m.id === userId)
              ?.displayName.charAt(0)
              .toUpperCase()
          }}
        </span>
      </span>
      <span class="flex-1 truncate text-sm" style="color: #e5e0ed">{{
        group.members.find((m) => m.id === userId)?.displayName
      }}</span>
      <input
        v-model.number="split.percentValues[userId]"
        type="number"
        step="0.1"
        min="0"
        max="100"
        placeholder="0"
        class="w-20 rounded-lg px-3 py-2 text-sm text-right outline-none"
        style="
          background: #201f27;
          border: 1px solid rgba(71, 69, 84, 0.3);
          color: #e5e0ed;
        "
      />
      <span class="w-4 text-sm" style="color: #c8c4d7">%</span>
    </div>
    <p class="text-sm text-right" style="color: #c8c4d7">
      {{
        t('expenseForm.totalPercent', {
          total: Number(split.percentSum).toFixed(1),
        })
      }}
    </p>
  </div>
</template>
