<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DatePicker } from 'v-calendar';

interface Props {
  modelValue: string;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Compute today's ISO date once in setup (not per-render).
const todayIso = new Date().toISOString().slice(0, 10);

const isOpen = ref(false);
const draft = ref(props.modelValue || todayIso);

// Reset draft to the committed modelValue whenever the sheet opens, so a
// Cancel just discards in-flight day clicks without emitting.
watch(isOpen, (open) => {
  if (open) {
    draft.value = props.modelValue || todayIso;
  }
});

const selectAttribute = computed(() => ({
  highlight: { color: '#6554E7', fillMode: 'solid' as const },
  content: { color: '#F0EBFF', fontWeight: 700 },
}));

function formatDate(ymd: string): string {
  const value = ymd || todayIso;
  const d = new Date(value + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function openSheet(): void {
  draft.value = props.modelValue || todayIso;
  isOpen.value = true;
}

function apply(): void {
  const value = draft.value; // capture before closing
  isOpen.value = false;
  emit('update:modelValue', value);
  emit('close');
}

function cancel(): void {
  isOpen.value = false;
  emit('close');
}
</script>

<template>
  <div
    data-test-id="dtp"
    class="flex flex-col gap-1.5 cursor-pointer"
    @click="openSheet"
  >
    <span
      class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C8C4D7]"
      >Date</span
    >
    <div
      class="rounded-xl px-4 py-3 bg-[#201F27] border border-[rgba(71,69,84,0.3)] flex items-center justify-between gap-3"
    >
      <span class="flex items-center gap-3 min-w-0">
        <svg
          viewBox="0 0 16 17"
          class="h-4 w-4 shrink-0 fill-current text-[#C8C4D7]"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M4 1.5v2M12 1.5v2M1.5 6.5h13M3 3.5h10A1.5 1.5 0 0 1 14.5 5v9A1.5 1.5 0 0 1 13 15.5H3A1.5 1.5 0 0 1 1.5 14V5A1.5 1.5 0 0 1 3 3.5z"
            stroke="#C8C4D7"
            stroke-width="1.2"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-sm text-[#E5E0ED] truncate">{{
          formatDate(modelValue)
        }}</span>
      </span>
      <svg
        viewBox="0 0 12 8"
        class="h-3 w-3 shrink-0 fill-current text-[#C8C4D7]"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M1 1l5 5 5-5"
          stroke="#C8C4D7"
          stroke-width="1.5"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      role="dialog"
      aria-label="Select date"
      class="fixed inset-0 z-50"
    >
      <!-- Scrim -->
      <div
        class="absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-[2px]"
        @click="cancel"
      ></div>
      <!-- Card -->
      <div
        class="absolute bottom-0 inset-x-0 max-w-[390px] mx-auto bg-[#1C1B23] rounded-t-[24px] border-t border-[rgba(255,255,255,0.1)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        <!-- Handle -->
        <div class="flex justify-center pt-3 pb-1">
          <div class="w-12 h-1.5 rounded-full bg-[rgba(200,196,215,0.3)]"></div>
        </div>
        <!-- Outer Header -->
        <div
          class="flex justify-between items-center px-5 pt-2 pb-4 border-b border-[rgba(255,255,255,0.05)]"
        >
          <div class="flex flex-col">
            <span
              class="font-display text-[10px] font-medium uppercase tracking-[0.05em] text-[#C6BFFF]"
              >SELECT DATE</span
            >
            <span class="text-2xl font-bold text-[#E5E0ED]">{{
              formatDate(draft)
            }}</span>
          </div>
          <button class="px-2 py-1" @click="cancel">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="#C8C4D7"
              stroke-width="2"
              stroke-linecap="round"
            >
              <line x1="2" y1="2" x2="12" y2="12" />
              <line x1="12" y1="2" x2="2" y2="12" />
            </svg>
          </button>
        </div>
        <!-- v-calendar DatePicker (INLINE, no popover slot). The `.string`
             v-model modifier is REQUIRED: v-calendar 3.1.2 derives the emitted
             value type only from modelModifiers (model-config is ignored), and
             without it the day-click emits a Date object instead of a string. -->
        <div class="px-5 py-2">
          <DatePicker
            v-model.string="draft"
            mode="date"
            is-dark
            :color="'#6554E7'"
            :first-day-of-week="1"
            :masks="{ title: 'MMMM YYYY', modelValue: 'YYYY-MM-DD' }"
            :select-attribute="selectAttribute"
            trim-weeks
            borderless
          />
        </div>
        <!-- Footer Actions -->
        <div
          class="flex justify-end gap-2 px-5 py-4 border-t border-[rgba(255,255,255,0.05)]"
        >
          <button
            type="button"
            class="rounded-full px-6 py-3 text-[12px] font-medium tracking-[0.05em] text-[#C8C4D7]"
            @click="cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-full px-6 py-3 text-[12px] font-medium tracking-[0.05em] text-[#F0EBFF] bg-[#6554E7]"
            @click="apply"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Make calendar container bg transparent (sheet bg shows through) */
:deep(.vc-container) {
  background: transparent !important;
}

/* Weekday cells: single uppercase letters, Geist-like */
:deep(.vc-weekday) {
  color: #c8c4d7;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.05em;
}

/* Day cell content */
:deep(.vc-day-content) {
  color: #e5e0ed;
  font-size: 16px;
  line-height: 24px;
  border-radius: 9999px;
  min-height: 46px;
  min-width: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Trailing/leading month days (dimmed) */
:deep(.vc-day.is-not-in-month .vc-day-content) {
  color: #474554;
}

/* Selected day highlight */
:deep(.vc-highlight) {
  background: #6554e7 !important;
  border-radius: 9999px !important;
  width: 100%;
  height: 100%;
}

/* Nav arrows */
:deep(.vc-nav-arrow) {
  color: #c8c4d7;
}

/* Month title */
:deep(.vc-title) {
  color: #e5e0ed;
  font-size: 16px;
  font-weight: 600;
}

/* Header padding */
:deep(.vc-header) {
  padding: 8px 0;
}
</style>
