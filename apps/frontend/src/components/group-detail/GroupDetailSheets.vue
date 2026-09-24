<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import BottomSheet from '@/components/BottomSheet.vue';
import CategoryRecapModal from '@/components/group-detail/CategoryRecapModal.vue';
import ExportModal from '@/components/group-detail/ExportModal.vue';
import TotalsModal from '@/components/group-detail/TotalsModal.vue';

import type { GroupDetail } from '@/types/group';

// The three group-detail overlays wrapped in `BottomSheet`, split out of
// `GroupDetailView.vue` so the three sheets don't push it over the
// ADR-0021 pure-LOC ceiling. Each `XModal` keeps mounting only while its
// sheet is open, so its own state (the totals/recap month window, the
// export form) still resets on every open, exactly as before this split.
const { t } = useI18n();

defineProps<{
  group: GroupDetail;
  groupId: string;
  showTotals: boolean;
  showExport: boolean;
  showCategories: boolean;
}>();

const emit = defineEmits<{
  'close-totals': [];
  'close-export': [];
  'close-categories': [];
}>();
</script>

<template>
  <BottomSheet
    :open="showExport"
    :label="t('groupDetail.exportModalTitle')"
    panel-class="w-full max-w-md rounded-t-2xl border border-[rgba(71,69,84,0.3)] bg-[#201F27] pb-6 shadow-xl sm:rounded-2xl"
    @close="emit('close-export')"
  >
    <ExportModal
      :group-id="groupId"
      :group-name="group.name"
      @close="emit('close-export')"
    />
  </BottomSheet>

  <BottomSheet
    :open="showTotals"
    :label="t('groupDetail.totalsModalTitle')"
    @close="emit('close-totals')"
  >
    <TotalsModal
      :expenses="group.expenses"
      :current-user-id="group.balance.currentUserId"
      @close="emit('close-totals')"
    />
  </BottomSheet>

  <BottomSheet
    :open="showCategories"
    :label="t('groupDetail.categoryRecapTitle')"
    @close="emit('close-categories')"
  >
    <CategoryRecapModal
      :expenses="group.expenses"
      :current-user-id="group.balance.currentUserId"
      @close="emit('close-categories')"
    />
  </BottomSheet>
</template>
