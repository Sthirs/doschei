<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import CategoryPicker from '@/components/CategoryPicker.vue';

const category = defineModel<string>('category', { required: true });
const description = defineModel<string>('description', { required: true });

const emit = defineEmits<{
  categoryPicked: [];
  descriptionInput: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex gap-2">
    <CategoryPicker
      v-model="category"
      @update:model-value="emit('categoryPicked')"
    />
    <input
      v-model="description"
      type="text"
      :placeholder="t('expenseForm.descriptionPlaceholder')"
      class="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
      style="
        background: #201f27;
        border: 1px solid rgba(71, 69, 84, 0.3);
        color: #e5e0ed;
      "
      @input="emit('descriptionInput')"
    />
  </div>
</template>
