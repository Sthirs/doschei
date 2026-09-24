<script setup lang="ts">
/**
 * Shared header chrome for every `BottomSheet`-based sheet (ADR-0027): the
 * drag zone, the padding/border rhythm, and the close button — unified so
 * every sheet's header looks like `DateTimePicker`'s, the one hand-rolled
 * header the other five had each drifted from in their own direction
 * (different close icons, different padding, different border colors).
 * Each sheet still owns its own title content (a plain heading here, a
 * caption-and-value pair in `DateTimePicker`), passed in as the default
 * slot.
 */
defineProps<{ closeLabel: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div
    data-sheet-drag
    class="flex items-center justify-between px-5 pt-2 pb-4 border-b border-[rgba(255,255,255,0.05)]"
  >
    <slot />
    <button type="button" class="px-2 py-1" :aria-label="closeLabel" @click="emit('close')">
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
</template>
