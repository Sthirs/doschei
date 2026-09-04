<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ memberCount: number }>();
defineEmits<{ settleUp: []; openExport: []; openTotals: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="flex gap-2">
    <button
      type="button"
      class="rounded-xl bg-[#6554E7] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-white transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="memberCount < 2"
      :title="
        memberCount < 2
          ? t('groupDetail.settleUpDisabledInviteTitle')
          : t('groupDetail.settleUpDisabledRecordTitle')
      "
      @click="$emit('settleUp')"
    >
      {{ t('groupDetail.settleUp') }}
    </button>
    <button
      type="button"
      class="rounded-xl border border-white/[0.05] bg-[rgba(42,42,42,0.6)] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-[#C8C4D7] backdrop-blur-[4px] transition hover:bg-[rgba(42,42,42,0.8)]"
      @click="$emit('openExport')"
    >
      {{ t('groupDetail.export') }}
    </button>
    <button
      type="button"
      class="rounded-xl border border-white/[0.05] bg-[rgba(42,42,42,0.6)] px-3 py-2 font-display text-xs font-medium tracking-[0.05em] text-[#C8C4D7] backdrop-blur-[4px] transition hover:bg-[rgba(42,42,42,0.8)]"
      @click="$emit('openTotals')"
    >
      {{ t('groupDetail.totals') }}
    </button>
  </div>
</template>
