<script setup lang="ts">
// The one-month-at-a-time (CategoryRecapModal) and three-month-at-a-time
// (TotalsModal) period selectors share this exact widget, extracted as-is
// per ADR-0021's extract-as-is rule and ADR-0026 §9. The anchor state and
// stepping logic stay in each caller; this component only renders the
// chrome and reports button presses.
defineProps<{
  label: string;
  labelTestId: string;
  previousLabel: string;
  nextLabel: string;
  canGoForward: boolean;
}>();
defineEmits<{ previous: []; next: [] }>();
</script>

<template>
  <div
    class="flex items-center justify-between rounded-2xl bg-brand-900 p-1.5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]"
  >
    <button
      type="button"
      class="flex size-10 items-center justify-center rounded-xl text-[#9CA3AF] transition hover:bg-white/5 hover:text-[#E5E0ED]"
      :aria-label="previousLabel"
      @click="$emit('previous')"
    >
      <!-- The chevron glyph the app already uses, turned to point left -->
      <svg
        viewBox="0 0 12 8"
        class="h-4 w-4 rotate-90 fill-none stroke-current"
        aria-hidden="true"
      >
        <path
          d="M1 1l5 5 5-5"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <span class="flex items-center gap-2">
      <svg
        viewBox="0 0 16 17"
        class="h-3.5 w-3.5 shrink-0 fill-none stroke-current text-brand-500"
        aria-hidden="true"
      >
        <path
          d="M4 1.5v2M12 1.5v2M1.5 6.5h13M3 3.5h10A1.5 1.5 0 0 1 14.5 5v9A1.5 1.5 0 0 1 13 15.5H3A1.5 1.5 0 0 1 1.5 14V5A1.5 1.5 0 0 1 3 3.5z"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span
        class="text-[12px] font-bold leading-4 tracking-[-0.3px] text-white"
        :data-testid="labelTestId"
      >
        {{ label }}
      </span>
    </span>
    <button
      type="button"
      class="flex size-10 items-center justify-center rounded-xl text-[#9CA3AF] transition hover:bg-white/5 hover:text-[#E5E0ED] disabled:opacity-50 disabled:hover:bg-transparent"
      :disabled="!canGoForward"
      :aria-label="nextLabel"
      @click="$emit('next')"
    >
      <svg
        viewBox="0 0 12 8"
        class="h-4 w-4 -rotate-90 fill-none stroke-current"
        aria-hidden="true"
      >
        <path
          d="M1 1l5 5 5-5"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
</template>
