<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  submitting: boolean;
  isFormValid: boolean;
  mode: 'create' | 'edit';
}>();

const emit = defineEmits<{
  delete: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="relative shrink-0 px-4">
    <div
      class="absolute inset-x-0 bottom-full h-4 bg-gradient-to-t from-[#13121B] pointer-events-none"
    ></div>
    <div class="flex flex-col gap-2 pb-4">
      <button
        type="submit"
        form="expense-form"
        class="w-full rounded-xl py-4 text-base font-semibold transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:bg-[#474554]"
        style="background: #6554e7; color: #f0ebff"
        :disabled="submitting || !isFormValid"
      >
        {{ submitting ? t('expenseForm.saving') : t('expenseForm.save') }}
      </button>

      <button
        v-if="mode === 'edit'"
        type="button"
        class="w-full py-2 text-center text-sm font-medium transition hover:bg-[#2A2932]"
        style="
          color: #ffb4ab;
          border: 1px solid rgba(255, 180, 171, 0.3);
          border-radius: 0.75rem;
        "
        @click="emit('delete')"
      >
        {{ t('expenseForm.delete') }}
      </button>
    </div>
  </div>
</template>
