import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import BottomSheet from '@/components/BottomSheet.vue';

// Drag math in useSheetDrag.ts is relative to the panel's own height
// (getBoundingClientRect), so every drag test pins it to a fixed value
// rather than relying on happy-dom's (zero) layout.
const PANEL_HEIGHT = 400;

function mountSheet(props: Record<string, unknown> = {}) {
  return mount(BottomSheet, {
    attachTo: document.body,
    props: { open: true, label: 'Test sheet', ...props },
    slots: { default: '<p data-testid="content">Hello</p>' },
    global: { stubs: { Teleport: true } },
  });
}

function stubPanelHeight(wrapper: ReturnType<typeof mountSheet>): void {
  const panel = wrapper.get('.sheet-panel').element as HTMLElement;
  panel.getBoundingClientRect = () =>
    ({ height: PANEL_HEIGHT }) as DOMRect;
}

// The panel is the pointerdown/pointermove/pointerup target in the real
// component (the listener sits on `.sheet-panel`, reached via bubbling from
// any `[data-sheet-drag]` descendant, exactly like a finger dragging the
// handle or header). `pointermove`/`pointerup` are tracked on `window`, per
// useSheetDrag.ts. useSheetDrag computes a release velocity from real elapsed
// time, so dispatching pointerdown/pointermove back-to-back would read as an
// (essentially infinite) flick regardless of `dy` — a real, generous delay
// between them keeps every drag here well under the 0.5px/ms dismiss
// velocity, so only `dy` decides whether the drag crosses the threshold.
async function drag(
  downTarget: Element,
  dy: number,
): Promise<void> {
  downTarget.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
      bubbles: true,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      pointerId: 1,
      clientX: 0,
      clientY: dy,
    }),
  );
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
}

describe('BottomSheet', () => {
  it('renders the slot and dialog chrome when open', () => {
    const wrapper = mountSheet({ open: true });

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toBe('Test sheet');
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('renders nothing when closed', () => {
    const wrapper = mountSheet({ open: false });

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('a scrim click emits close', async () => {
    const wrapper = mountSheet();

    await wrapper.get('.sheet-scrim').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
  });

  it('a drag past the dismiss threshold on the handle emits close', async () => {
    const wrapper = mountSheet();
    stubPanelHeight(wrapper);
    const handle = wrapper.get('[data-sheet-drag]').element;

    // Past 30% of the 400px panel (120px).
    await drag(handle, 200);

    expect(wrapper.emitted('close')).toHaveLength(1);

    wrapper.unmount();
  });

  it('a short, slow drag snaps back without closing', async () => {
    const wrapper = mountSheet();
    stubPanelHeight(wrapper);
    const handle = wrapper.get('[data-sheet-drag]').element;

    // Well under the 120px dismiss threshold.
    await drag(handle, 40);

    expect(wrapper.emitted('close')).toBeUndefined();
    // The snap-back transition is armed synchronously on pointerup, before
    // `dragY` itself resets on the next animation frame.
    expect(wrapper.get('.sheet-panel').classes()).toContain('is-settling');

    wrapper.unmount();
  });

  it('a drag-dismiss with no trailing click (e.g. touch) does not swallow a later, unrelated click', async () => {
    const wrapper = mountSheet();
    stubPanelHeight(wrapper);
    const handle = wrapper.get('[data-sheet-drag]').element;

    // Past the dismiss threshold, exactly like the "past the dismiss
    // threshold" test above — but `drag()` never dispatches a native
    // `click`, matching a touch drag (browsers don't fire one after a touch
    // gesture that moved this far). Before the fix, the `once` click
    // listener armed on `window` in onPointerUp would stay attached
    // forever, waiting to swallow whatever the user's next, unrelated tap
    // turned out to be.
    await drag(handle, 200);
    expect(wrapper.emitted('close')).toHaveLength(1);

    // Let the internal `setTimeout(…, 0)` cleanup run before checking that a
    // later click elsewhere on the page reaches its own target normally.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const target = document.createElement('button');
    document.body.appendChild(target);
    let clicked = false;
    target.addEventListener('click', () => {
      clicked = true;
    });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(clicked).toBe(true);

    target.remove();
    wrapper.unmount();
  });

  it('a pointerdown outside a drag zone does not start a drag', async () => {
    const wrapper = mountSheet();
    stubPanelHeight(wrapper);
    const content = wrapper.get('[data-testid="content"]').element;

    await drag(content, 300);

    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.get('.sheet-panel').classes()).not.toContain('is-settling');
    expect(wrapper.get('.sheet-panel').attributes('style')).toContain(
      'translate: 0 0px',
    );

    wrapper.unmount();
  });
});
