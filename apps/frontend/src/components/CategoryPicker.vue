<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

import {
  CATEGORIES_GROUPED,
  CATEGORY_FAMILY_LABELS,
  getCategory,
} from '@/lib/categories';

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
const desktopSearchInputRef = ref<HTMLInputElement | null>(null);
const mobileSearchInputRef = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');

const current = computed(() => getCategory(props.modelValue));

const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return CATEGORIES_GROUPED;
  return CATEGORIES_GROUPED
    .map((group) => {
      const familyLabel = CATEGORY_FAMILY_LABELS[group.family].toLowerCase();
      const familyMatches = familyLabel.includes(q);
      const entries = familyMatches
        ? [...group.entries]
        : group.entries.filter((e) => e.label.toLowerCase().includes(q));
      return { ...group, entries };
    })
    .filter((group) => group.entries.length > 0);
});

const sizeClasses = computed(() =>
  props.size === 'sm'
    ? 'h-8 w-8 text-base'
    : 'h-10 w-10 text-lg',
);

const open = () => {
  searchQuery.value = '';
  isOpen.value = true;
  nextTick(() => {
    desktopSearchInputRef.value?.focus();
    mobileSearchInputRef.value?.focus();
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
    if (searchQuery.value) {
      searchQuery.value = '';
      return;
    }
    close();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const q = searchQuery.value.trim();
    if (!q) return;
    const firstGroup = filteredGroups.value[0];
    if (firstGroup && firstGroup.entries.length > 0) {
      select(firstGroup.entries[0].key);
    }
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
  <div class="relative flex items-center">
    <button
      ref="triggerRef"
      type="button"
      :class="[
        'flex shrink-0 items-center justify-center rounded-full transition',
        sizeClasses,
      ]"
      :style="{
        backgroundColor: `${current.color}33`,
        border: `1px solid ${current.color}4D`,
      }"
      :title="current.label"
      :aria-label="`Category: ${current.label}`"
      @click.stop="open"
    >
      <img
        :src="current.iconPath"
        :alt="current.label"
        class="h-4 w-4"
        aria-hidden="true"
      />
    </button>

    <!-- Desktop popover (hidden on mobile) -->
    <div
      v-if="isOpen"
      ref="panelRef"
      tabindex="-1"
      class="absolute left-0 top-full z-50 mt-2 hidden w-72 flex-col overflow-hidden rounded-xl sm:flex"
      role="dialog"
      aria-modal="true"
      aria-label="Select category"
      @keydown="onKeydown"
    >
      <div class="bg-[#1E1E26] max-h-80 overflow-y-auto rounded-xl shadow-xl">
        <div class="sticky top-0 z-10 border-b border-white/10 bg-[#1E1E26] px-3 py-2">
          <input
            ref="desktopSearchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Search categories"
            aria-label="Search categories"
            autocomplete="off"
            class="w-full rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E5E0ED] placeholder:text-[#C8C4D7]/50 outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        <div v-if="filteredGroups.length === 0" class="px-3 py-4 text-center text-sm text-[#C8C4D7]">
          <p role="status">No matching category</p>
        </div>
        <div v-for="group in filteredGroups" :key="group.family" class="py-1">
          <p class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#C8C4D7]">
            {{ group.label }}
          </p>
          <button
            v-for="cat in group.entries"
            :key="cat.key"
            type="button"
            :class="[
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition',
              cat.key === modelValue
                ? 'bg-white/5'
                : 'text-[#E5E0ED] hover:bg-white/5',
            ]"
            @click="select(cat.key)"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              :style="{
                backgroundColor: `${cat.color}33`,
                border: `1px solid ${cat.color}4D`,
              }"
            >
              <img
                :src="cat.iconPath"
                :alt="cat.label"
                class="h-4 w-4"
                aria-hidden="true"
              />
            </span>
            <span class="flex-1">{{ cat.label }}</span>
            <svg
              v-if="cat.key === modelValue"
              viewBox="0 0 20 20"
              class="h-4 w-4 fill-current"
              :style="{ color: cat.color }"
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
          class="bg-[#1E1E26] max-h-[85vh] overflow-y-auto rounded-t-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Select category"
          @click.stop
        >
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#1E1E26] px-4 py-3">
            <h3 class="text-sm font-medium text-[#E5E0ED]">Select Category</h3>
            <button
              type="button"
              class="rounded-md p-1 text-[#C8C4D7] hover:text-[#E5E0ED]"
              aria-label="Close"
              @click="close"
            >
              <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          <div class="px-2 py-2">
            <div class="sticky top-0 z-10 bg-[#1E1E26] px-2 py-2">
              <input
                ref="mobileSearchInputRef"
                v-model="searchQuery"
                type="text"
                placeholder="Search categories"
                aria-label="Search categories"
                autocomplete="off"
                class="w-full rounded-md bg-white/5 px-3 py-2 text-sm text-[#E5E0ED] placeholder:text-[#C8C4D7]/50 outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div v-if="filteredGroups.length === 0" class="px-3 py-4 text-center text-sm text-[#C8C4D7]">
              <p role="status">No matching category</p>
            </div>
            <div v-for="group in filteredGroups" :key="group.family" class="py-1">
              <p class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#C8C4D7]">
                {{ group.label }}
              </p>
              <button
                v-for="cat in group.entries"
                :key="cat.key"
                type="button"
                :class="[
                  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition',
                  cat.key === modelValue
                    ? 'bg-white/5'
                    : 'text-[#E5E0ED] hover:bg-white/5',
                ]"
                @click="select(cat.key)"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  :style="{
                    backgroundColor: `${cat.color}33`,
                    border: `1px solid ${cat.color}4D`,
                  }"
                >
                  <img
                    :src="cat.iconPath"
                    :alt="cat.label"
                    class="h-4 w-4"
                    aria-hidden="true"
                  />
                </span>
                <span class="flex-1">{{ cat.label }}</span>
                <svg
                  v-if="cat.key === modelValue"
                  viewBox="0 0 20 20"
                  class="h-4 w-4 fill-current"
                  :style="{ color: cat.color }"
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
