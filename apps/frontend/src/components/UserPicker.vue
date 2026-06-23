<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

import type { GroupMember } from '@/types/group';

const props = defineProps<{
  modelValue: string;
  members: GroupMember[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const isOpen = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);

const sortedMembers = computed(() =>
  [...props.members].sort((a, b) => a.displayName.localeCompare(b.displayName)),
);

const selected = computed(() =>
  sortedMembers.value.find((m) => m.id === props.modelValue) ?? null,
);

const initial = (name: string) => name.charAt(0).toUpperCase();

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

const select = (id: string) => {
  emit('update:modelValue', id);
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
      class="flex w-full items-center gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-brand-500/40 focus:bg-white/10"
      aria-label="Select who paid"
      @click.stop="open"
    >
      <span
        v-if="selected"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-500"
      >
        {{ initial(selected.displayName) }}
      </span>
      <span class="min-w-0 flex-1 truncate text-left">
        {{ selected?.displayName ?? 'Select...' }}
      </span>
      <svg viewBox="0 0 20 20" class="h-4 w-4 shrink-0 fill-current text-slate-400">
        <path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
      </svg>
    </button>

    <div
      v-if="isOpen"
      ref="panelRef"
      tabindex="-1"
      class="absolute left-0 top-full z-50 mt-2 hidden w-full flex-col overflow-hidden rounded-md sm:flex"
      role="dialog"
      aria-modal="true"
      aria-label="Select who paid"
      @keydown="onKeydown"
    >
      <div class="glass-panel max-h-60 overflow-y-auto rounded-md shadow-xl">
        <button
          v-for="member in sortedMembers"
          :key="member.id"
          type="button"
          :class="[
            'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition',
            member.id === modelValue
              ? 'bg-brand-500/10 text-brand-500'
              : 'text-slate-200 hover:bg-white/5',
          ]"
          @click="select(member.id)"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-500"
          >
            {{ initial(member.displayName) }}
          </span>
          <span class="min-w-0 flex-1 truncate">{{ member.displayName }}</span>
          <svg
            v-if="member.id === modelValue"
            viewBox="0 0 20 20"
            class="h-4 w-4 shrink-0 fill-current"
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
          aria-label="Select who paid"
          @click.stop
        >
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur">
            <h3 class="text-sm font-medium text-slate-100">Paid by</h3>
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
            <button
              v-for="member in sortedMembers"
              :key="member.id"
              type="button"
              :class="[
                'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition',
                member.id === modelValue
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'text-slate-200 hover:bg-white/5',
              ]"
              @click="select(member.id)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-500"
              >
                {{ initial(member.displayName) }}
              </span>
              <span class="min-w-0 flex-1 truncate">{{ member.displayName }}</span>
              <svg
                v-if="member.id === modelValue"
                viewBox="0 0 20 20"
                class="h-4 w-4 shrink-0 fill-current"
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
    </Teleport>
  </div>
</template>
