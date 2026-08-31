<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const amount = defineModel<number | ''>({ required: true });

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2">
    <label
      for="expense-amount"
      class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
      >{{ t('expenseForm.amountLabel') }}</label
    >
    <div class="relative">
      <input
        id="expense-amount"
        v-model="amount"
        type="number"
        step="0.01"
        min="0.01"
        :placeholder="t('expenseForm.amountPlaceholder')"
        autofocus
        class="w-full rounded-lg bg-[#201F27] border border-[rgba(71,69,84,0.3)] py-3 pl-4 pr-12 text-base text-left text-[#E5E0ED] outline-none placeholder-[#C8C4D7] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span
        class="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-[#E5E0ED] font-semibold select-none"
        >&euro;</span
      >
    </div>
  </div>
</template>
