<script setup lang="ts">
import { ref, watch } from 'vue';

import { useSheetDrag } from '@/composables/useSheetDrag';

/**
 * Shared bottom-sheet/centred-popup shell for every modal and picker sheet
 * (ADR-0027): Teleport + scrim + panel, Carbon-productive-motion enter/exit,
 * and drag-to-dismiss on any descendant marked `[data-sheet-drag]` (the
 * handle this component renders, plus each caller's own header). The caller
 * owns everything inside the panel via the default slot.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    label: string;
    /** Replaces the default Totals/Recap-style panel chrome. */
    panelClass?: string;
    /** Hides the whole sheet at the `sm:` breakpoint, for pickers that show
     *  a separate desktop popover elsewhere in their own template. */
    mobileOnly?: boolean;
    /** False for sheets that stay bottom-anchored at every viewport size
     *  (no `sm:` centred-popup variant), e.g. `DateTimePicker`. */
    centerOnDesktop?: boolean;
  }>(),
  { panelClass: undefined, mobileOnly: false, centerOnDesktop: true },
);

const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLDivElement | null>(null);
const { dragY, settling, onPointerDown, onTransitionEnd, reset } =
  useSheetDrag(panelRef, () => emit('close'));

// A reopen must start from a clean slate — otherwise a sheet closed by
// dragging (and thus never `reset()`'d by `after-leave`, see below) would
// briefly flash at its old drag offset while it should be off-screen and
// entering fresh.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) reset();
  },
);

const DEFAULT_PANEL_CLASS =
  'relative w-full max-w-[390px] rounded-t-[24px] border-t border-white/10 bg-[#1C1B25] pb-6 shadow-[0_-12px_20px_rgba(0,0,0,0.6)] sm:rounded-[24px] sm:border sm:pb-5 sm:shadow-[0_20px_40px_rgba(0,0,0,0.6)]';
</script>

<template>
  <Teleport to="body">
    <!-- `:duration` makes Vue time the leave phase itself instead of
         listening for `transitionend`, which stays free for `onTransitionEnd`
         above to watch the unrelated drag-settle transition. -->
    <Transition name="sheet" :duration="110" @after-leave="reset">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center"
        :class="[
          mobileOnly ? 'sm:hidden' : '',
          centerOnDesktop ? 'sheet-desktop-centered sm:items-center sm:p-4' : '',
        ]"
      >
        <div
          class="sheet-scrim absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-[2px]"
          @click="emit('close')"
        ></div>
        <div
          ref="panelRef"
          class="sheet-panel"
          :class="[panelClass ?? DEFAULT_PANEL_CLASS, { 'is-settling': settling }]"
          :style="{ translate: `0 ${dragY}px` }"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          @pointerdown="onPointerDown"
          @transitionend="onTransitionEnd"
          @click.stop
        >
          <div data-sheet-drag class="flex justify-center pt-3 pb-1 sm:hidden">
            <div
              class="h-1.5 w-12 rounded-full bg-[rgba(200,196,215,0.3)]"
              aria-hidden="true"
            ></div>
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Carbon's "productive" motion (https://carbondesignsystem.com/elements/motion/overview/),
   implemented by hand rather than through @carbon/motion — see ADR-0027.
   Entrance uses the entrance-productive easing, exit the exit-productive
   one, both at Carbon's fast-02 (110ms) duration: the token Carbon
   documents for "subtle entrance or exit of small UI elements" — quick and
   unobtrusive, matching a sheet the user just asked to open or close. */
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition-property: transform;
  transition-duration: var(--duration-fast-02);
}
.sheet-enter-active .sheet-panel {
  transition-timing-function: var(--ease-entrance-productive);
}
.sheet-leave-active .sheet-panel {
  transition-timing-function: var(--ease-exit-productive);
}

.sheet-enter-active .sheet-scrim,
.sheet-leave-active .sheet-scrim {
  transition-property: opacity;
  transition-duration: var(--duration-fast-02);
}
.sheet-enter-active .sheet-scrim {
  transition-timing-function: var(--ease-entrance-productive);
}
.sheet-leave-active .sheet-scrim {
  transition-timing-function: var(--ease-exit-productive);
}

.sheet-leave-active {
  /* A closing scrim must not still swallow the tap that opens whatever
     comes next. */
  pointer-events: none;
}

.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}
.sheet-enter-from .sheet-scrim,
.sheet-leave-to .sheet-scrim {
  opacity: 0;
}
/* Above the bottom-sheet breakpoint the panel is centred, not flush to the
   bottom edge, so its own height is not "off screen" — translate by the
   full viewport height instead, so it still starts and ends below the fold. */
@media (min-width: 640px) {
  .sheet-desktop-centered.sheet-enter-from .sheet-panel,
  .sheet-desktop-centered.sheet-leave-to .sheet-panel {
    transform: translateY(100dvh);
  }
}

/* Snap-back after a drag that didn't clear the dismiss threshold: a short,
   standard-easing move back to rest — distinct from the entrance/exit
   tokens above (ADR-0027). Carbon's fast-01 (70ms), "instant response to
   user action," fits this corrective micro-interaction better than a
   duration meant for the sheet's own open/close. */
.sheet-panel.is-settling {
  transition: translate var(--duration-fast-01) var(--ease-standard-productive);
}

.sheet-panel :deep([data-sheet-drag]) {
  touch-action: none;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active .sheet-panel,
  .sheet-leave-active .sheet-panel {
    transition-property: opacity;
    transform: none;
  }
  .sheet-enter-from .sheet-panel,
  .sheet-leave-to .sheet-panel {
    transform: none;
    opacity: 0;
  }
}
</style>
