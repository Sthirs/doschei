<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

import type { GroupMember } from '@/types/group';

const { t } = useI18n();

const props = defineProps<{
  modelValue: string;
  members: GroupMember[];
  testId?: string;
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
      class="flex w-full items-center gap-3 rounded-xl border border-[rgba(71,69,84,0.3)] bg-[#201F27] px-4 py-3 text-sm text-[#E5E0ED] outline-none transition focus:border-[#6554E7]/40 focus:bg-[#2a2933]"
      :aria-label="t('userPicker.triggerAriaLabel')"
      :data-testid="props.testId"
      @click.stop="open"
    >
      <span
        v-if="selected"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/20 text-xs font-semibold text-[#6554E7]"
      >
        <img
          v-if="selected.imageUrl"
          :src="selected.imageUrl"
          alt=""
          aria-hidden="true"
          class="h-full w-full rounded-full object-cover"
        />
        <span v-else>{{ initial(selected.displayName) }}</span>
      </span>
      <span class="min-w-0 flex-1 truncate text-left">
        {{ selected?.displayName ?? t('userPicker.selectPlaceholder') }}
      </span>
      <svg viewBox="0 0 20 20" class="h-4 w-4 shrink-0 fill-current text-[#C8C4D7]">
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
      :aria-label="t('userPicker.triggerAriaLabel')"
      @keydown="onKeydown"
    >
      <div class="max-h-60 overflow-y-auto rounded-xl bg-[#1E1E26] border border-white/[0.08] shadow-xl">
        <button
          v-for="member in sortedMembers"
          :key="member.id"
          type="button"
          :class="[
            'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition',
            member.id === modelValue
              ? 'bg-[#6554E7]/10 text-[#6554E7]'
              : 'text-[#E5E0ED] hover:bg-white/5',
          ]"
          @click="select(member.id)"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/20 text-xs font-semibold text-[#6554E7]"
          >
            <img
              v-if="member.imageUrl"
              :src="member.imageUrl"
              alt=""
              aria-hidden="true"
              class="h-full w-full rounded-full object-cover"
            />
            <span v-else>{{ initial(member.displayName) }}</span>
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
        class="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm sm:hidden"
        @click="onBackdropClick"
        @keydown="onKeydown"
      >
        <div
          class="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[#1E1E26] border-t border-white/[0.08]"
          role="dialog"
          aria-modal="true"
          :aria-label="t('userPicker.triggerAriaLabel')"
          @click.stop
        >
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.08] bg-[#1E1E26] px-4 py-3">
            <h3 class="text-sm font-medium text-[#E5E0ED]">{{ t('userPicker.selectPayerHeading') }}</h3>
            <button
              type="button"
              class="rounded-md p-1 text-[#C8C4D7] hover:text-[#E5E0ED]"
              :aria-label="t('common.close')"
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
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                member.id === modelValue
                  ? 'bg-[#6554E7]/10 text-[#6554E7]'
                  : 'text-[#E5E0ED] hover:bg-white/5',
              ]"
              @click="select(member.id)"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6554E7]/20 text-xs font-semibold text-[#6554E7]"
              >
                <img
                  v-if="member.imageUrl"
                  :src="member.imageUrl"
                  alt=""
                  aria-hidden="true"
                  class="h-full w-full rounded-full object-cover"
                />
                <span v-else>{{ initial(member.displayName) }}</span>
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
