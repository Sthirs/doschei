<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

import { CATEGORIES_GROUPED, getCategory } from '@/lib/categories';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    size?: 'sm' | 'md';
  }>(),
  { size: 'md' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const isOpen = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);

const current = computed(() => getCategory(props.modelValue));

const sizeClasses = computed(() =>
  props.size === 'sm'
    ? 'h-8 w-8 text-base'
    : 'h-10 w-10 text-lg',
);

const open = () => {
  isOpen.value = true;
  nextTick(() => {
    panelRef.value?.focus();
  });
};

const close = () => {
  isOpen.value = false;
  triggerRef.value?.focus();
};

const select = (key: string) => {
  emit('update:modelValue', key);
  close();
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
};

const onBackdropClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    close();
  }
};

const onDocumentClick = (event: MouseEvent) => {
  if (
    isOpen.value &&
    triggerRef.value &&
    panelRef.value &&
    !triggerRef.value.contains(event.target as Node) &&
    !panelRef.value.contains(event.target as Node)
  ) {
    close();
  }
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true);
});
</script>

<template>
  <div class="relative">
    <button
      ref="triggerRef"
      type="button"
      :class="[
        'flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:border-brand-500/40 hover:bg-brand-500/10',
        sizeClasses,
      ]"
      :title="current.label"
      :aria-label="`Category: ${current.label}`"
      @click.stop="open"
    >
      <span aria-hidden="true">{{ current.icon }}</span>
    </button>

    <!-- Desktop popover (hidden on mobile) -->
    <div
      v-if="isOpen"
      ref="panelRef"
      tabindex="-1"
      class="absolute left-0 top-full z-50 mt-2 hidden w-72 flex-col overflow-hidden rounded-md sm:flex"
      role="dialog"
      aria-modal="true"
      aria-label="Select category"
      @keydown="onKeydown"
    >
      <div class="glass-panel max-h-80 overflow-y-auto rounded-md shadow-xl">
        <div v-for="group in CATEGORIES_GROUPED" :key="group.family" class="py-1">
          <p class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {{ group.label }}
          </p>
          <button
            v-for="cat in group.entries"
            :key="cat.key"
            type="button"
            :class="[
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition',
              cat.key === modelValue
                ? 'bg-brand-500/10 text-brand-500'
                : 'text-slate-200 hover:bg-white/5',
            ]"
            @click="select(cat.key)"
          >
            <span class="text-base" aria-hidden="true">{{ cat.icon }}</span>
            <span class="flex-1">{{ cat.label }}</span>
            <svg
              v-if="cat.key === modelValue"
              viewBox="0 0 20 20"
              class="h-4 w-4 fill-current"
            >
              <path
                fill-rule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile full-screen sheet (visible only on mobile) -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm sm:hidden"
        @click="onBackdropClick"
        @keydown="onKeydown"
      >
        <div
          class="glass-panel max-h-[85vh] overflow-y-auto rounded-t-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Select category"
          @click.stop
        >
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur">
            <h3 class="text-sm font-medium text-slate-100">Select Category</h3>
            <button
              type="button"
              class="rounded-md p-1 text-slate-400 hover:text-slate-200"
              aria-label="Close"
              @click="close"
            >
              <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          <div class="px-2 py-2">
            <div v-for="group in CATEGORIES_GROUPED" :key="group.family" class="py-1">
              <p class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {{ group.label }}
              </p>
              <button
                v-for="cat in group.entries"
                :key="cat.key"
                type="button"
                :class="[
                  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition',
                  cat.key === modelValue
                    ? 'bg-brand-500/10 text-brand-500'
                    : 'text-slate-200 hover:bg-white/5',
                ]"
                @click="select(cat.key)"
              >
                <span class="text-lg" aria-hidden="true">{{ cat.icon }}</span>
                <span class="flex-1">{{ cat.label }}</span>
                <svg
                  v-if="cat.key === modelValue"
                  viewBox="0 0 20 20"
                  class="h-4 w-4 fill-current"
                >
                  <path
                    fill-rule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
