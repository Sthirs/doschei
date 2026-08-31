<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ errorMessage: string; deleting: boolean }>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="rounded-2xl border border-white/[0.08] p-6"
    style="background: #1e1e26"
  >
    <h3 class="text-center text-xl font-semibold mb-4" style="color: #e5e0ed">
      {{ t('expenseForm.areYouSure') }}
    </h3>
    <p class="mb-6 text-sm text-center" style="color: #c8c4d7">
      {{ t('expenseForm.deleteExpenseWarning') }}
    </p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl px-4 py-3 text-sm"
      style="
        color: #ffb4ab;
        background: rgba(255, 180, 171, 0.1);
        border: 1px solid rgba(255, 180, 171, 0.2);
      "
    >
      {{ errorMessage }}
    </p>

    <div class="flex flex-col gap-3">
      <button
        type="button"
        class="w-full rounded-xl py-4 text-base font-semibold transition hover:bg-[#e0392f] disabled:opacity-60"
        style="background: #ff5252; color: #fff"
        :disabled="deleting"
        @click="emit('confirm')"
      >
        {{ deleting ? t('common.deleting') : t('expenseForm.confirmDelete') }}
      </button>
      <button
        type="button"
        class="w-full py-2 text-center text-sm transition hover:text-[#E5E0ED]"
        style="color: #c8c4d7"
        :disabled="deleting"
        @click="emit('cancel')"
      >
        {{ t('expenseForm.cancel') }}
      </button>
    </div>
  </div>
</template>
