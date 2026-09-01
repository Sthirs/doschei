<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineEmits<{ back: [] }>();

const { t } = useI18n();
</script>

<template>
  <Teleport to="#topbar-leading">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED]"
      :aria-label="t('groupDetail.backToGroups')"
      @click="$emit('back')"
    >
      <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
        <path
          fill-rule="evenodd"
          d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </Teleport>
</template>
