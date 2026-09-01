<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { GroupDetail } from '@/types/group';

defineProps<{ group: GroupDetail }>();

const paidByUserId = defineModel<string>('paidByUserId', { required: true });

const { t } = useI18n();

// Render only the first word of a member's display name inside the compact
// member buttons; CSS `truncate` adds "…" if even that is too wide.
const shortName = (displayName: string): string =>
  displayName.trim().split(/\s+/)[0] || displayName;
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="paid-by-section">
    <span
      class="font-display text-[10px] font-medium uppercase tracking-[0.05em]"
      style="color: #c8c4d7"
      >{{ t('expenseForm.paidBy') }}</span
    >
    <div class="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
      <button
        v-for="member in group.members"
        :key="member.id"
        type="button"
        class="flex min-w-0 flex-col items-center gap-2 rounded-xl px-2 py-2 transition sm:w-20 sm:shrink-0"
        :class="
          paidByUserId === member.id
            ? 'bg-[#6554E7]/20 ring-1 ring-[#6554E7]'
            : 'hover:bg-[#2A2932]'
        "
        :style="paidByUserId !== member.id ? 'background: #201F27' : ''"
        @click="paidByUserId = member.id"
      >
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-[#6554E7]/30 text-[10px] font-semibold"
          style="color: #c6bfff"
        >
          <img
            v-if="member.imageUrl"
            :src="member.imageUrl"
            alt=""
            aria-hidden="true"
            class="h-full w-full rounded-full object-cover"
          />
          <span v-else>{{ member.displayName.charAt(0).toUpperCase() }}</span>
        </span>
        <span class="max-w-full truncate text-xs" style="color: #e5e0ed">{{
          shortName(member.displayName)
        }}</span>
      </button>
    </div>
  </div>
</template>
