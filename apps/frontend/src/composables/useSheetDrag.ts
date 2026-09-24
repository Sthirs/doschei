import { ref, type Ref } from 'vue';

// A drag past 30% of the sheet's own height, or a fast enough flick,
// dismisses it — otherwise it snaps back to rest. Mirrors the thresholds
// mobile bottom sheets commonly use (e.g. iOS/Material sheets).
const DISMISS_HEIGHT_RATIO = 0.3;
const DISMISS_VELOCITY_PX_PER_MS = 0.5;
// Below this many pixels of vertical movement, the gesture isn't treated as
// a drag yet — this both absorbs a plain tap and lets a mostly-horizontal
// gesture (irrelevant here, but cheap to guard) fall through untouched.
const DRAG_SLOP_PX = 6;

/**
 * Pointer-drag-to-dismiss for `BottomSheet.vue`. Only a pointerdown that
 * starts on an element carrying `[data-sheet-drag]` (the handle/header) is
 * tracked, so scrollable content inside the sheet keeps its native scroll
 * gesture. `dragY` is meant to be applied via the CSS `translate` property
 * (kept separate from the `transform` the enter/leave transition animates),
 * so a drag that ends in dismissal can hand off into that transition from
 * wherever the pointer let go, with no jump.
 */
export function useSheetDrag(
  panelRef: Ref<HTMLElement | null>,
  onDismiss: () => void,
) {
  const dragY = ref(0);
  // True only while the sheet is animating back to rest after a drag that
  // didn't clear the dismiss threshold — distinct from an active drag, where
  // the panel must track the pointer with no transition at all.
  const settling = ref(false);

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  // A drag that ends over a button (e.g. the header's close icon) must not
  // also fire that button's click.
  const swallowClick = (event: MouseEvent): void => {
    window.removeEventListener('click', swallowClick, { capture: true });
    event.stopPropagation();
    event.preventDefault();
  };

  // Mouse drags always fire a trailing `click` right after `pointerup`/
  // `mouseup`, in the same synchronous dispatch sequence — but touch drags
  // that moved far enough usually fire none at all. Without this, the
  // `once` listener below would sit on `window` forever, waiting to eat
  // the very next click ANYWHERE on the page, whenever the user happened
  // to tap next — the bug this guards against. A `setTimeout` runs only
  // after that synchronous sequence (and any real click within it) has
  // already happened, so it's safe to always clean up here.
  const armClickSwallow = (): void => {
    window.addEventListener('click', swallowClick, {
      capture: true,
      once: true,
    });
    setTimeout(() => {
      window.removeEventListener('click', swallowClick, { capture: true });
    }, 0);
  };

  const stopTracking = (): void => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    pointerId = null;
  };

  function onPointerMove(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const dy = event.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) < DRAG_SLOP_PX) return;
      if (Math.abs(event.clientX - startX) > Math.abs(dy)) return;
      dragging = true;
      panelRef.value?.setPointerCapture(pointerId);
    }
    const now = performance.now();
    if (now > lastT) velocity = (event.clientY - lastY) / (now - lastT);
    lastY = event.clientY;
    lastT = now;
    // The sheet only ever drags downward, toward dismissal.
    dragY.value = Math.max(0, dy);
    event.preventDefault();
  }

  function onPointerUp(): void {
    const wasDragging = dragging;
    if (pointerId !== null) panelRef.value?.releasePointerCapture(pointerId);
    stopTracking();
    if (!wasDragging) return;
    dragging = false;

    armClickSwallow();

    const panelHeight = panelRef.value?.getBoundingClientRect().height || 1;
    const shouldDismiss =
      dragY.value > panelHeight * DISMISS_HEIGHT_RATIO ||
      velocity > DISMISS_VELOCITY_PX_PER_MS;

    if (shouldDismiss) {
      onDismiss();
      return;
    }

    // Adding `.is-settling` (which the panel's own class binding applies
    // when `settling` is true) and changing `dragY` in the same tick would
    // give the browser nothing to transition from — both the transition
    // rule and the target value would land in the same style recalculation.
    // Deferring the value change to the next frame lets it see the dragged
    // position as the "from" state first.
    settling.value = true;
    requestAnimationFrame(() => {
      dragY.value = 0;
    });
  }

  function onPointerCancel(): void {
    stopTracking();
    dragging = false;
    dragY.value = 0;
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || pointerId !== null) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-sheet-drag]')) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastY = event.clientY;
    lastT = performance.now();
    velocity = 0;
    dragging = false;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  // `touch-action: none` on the drag zone stops native scrolling, but Chrome
  // on Android still runs its own gesture recognition on the unconsumed
  // touches: a quick flick-to-dismiss ends in a fling, and the next tap
  // anywhere is swallowed as "the tap that stopped the fling" — so the
  // button that just opened the sheet seemed dead right after a flick.
  // Consuming the `touchmove`s of a tracked drag keeps them away from that
  // recognizer entirely. `touchmove` fires after its `pointermove`, so
  // `pointerId` is already set; `touchstart` is left alone so a tap on the
  // header's close button still produces its click.
  const onTouchMove = (event: TouchEvent): void => {
    if (pointerId !== null && event.cancelable) event.preventDefault();
  };

  const onTransitionEnd = (event: TransitionEvent): void => {
    if (event.propertyName === 'translate') settling.value = false;
  };

  // Run when the sheet reopens or has fully left the DOM, so neither a
  // half-finished settle nor a stale drag offset carries into next time.
  const reset = (): void => {
    dragY.value = 0;
    settling.value = false;
  };

  return {
    dragY,
    settling,
    onPointerDown,
    onTouchMove,
    onTransitionEnd,
    reset,
  };
}
