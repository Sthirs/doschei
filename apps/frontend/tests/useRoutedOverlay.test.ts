import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';

import {
  useRoutedOverlay,
  OVERLAY_QUERY_KEY,
} from '@/composables/useRoutedOverlay';
import { goBackTo } from '@/lib/backNavigation';

// `close()` delegates to `goBackTo` (ADR-0024) rather than deciding pop vs
// replace itself — that decision, and the `state.back` semantics it depends
// on, are already proven in backNavigation.test.ts. Mocking it here lets this
// file assert only what useRoutedOverlay itself is responsible for: which
// target it hands off, and when it calls at all.
vi.mock('@/lib/backNavigation', () => ({
  goBackTo: vi.fn(),
}));

async function buildRouter(
  initialQuery: Record<string, string> = {},
): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/g/:id',
        name: 'group-detail',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push({ path: '/g/1', query: initialQuery });
  await router.isReady();
  return router;
}

// Every mount registers a window-level `keydown` listener (onMounted) that
// only detaches on unmount (onBeforeUnmount). `window` persists across tests
// within one file, so a wrapper left mounted keeps listening — leaking into
// later tests' Escape-key assertions as extra `goBackTo` calls. Track every
// wrapper this file mounts and unmount them all after each test.
const mountedWrappers: Array<ReturnType<typeof mount>> = [];

function mountOverlay(router: Router, id: string) {
  let overlay!: ReturnType<typeof useRoutedOverlay>;
  const Host = defineComponent({
    setup() {
      overlay = useRoutedOverlay(id);
      return () => h('div');
    },
  });
  const wrapper = mount(Host, { global: { plugins: [router] } });
  mountedWrappers.push(wrapper);
  return { overlay, wrapper };
}

describe('useRoutedOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mountedWrappers.forEach((w) => w.unmount());
    mountedWrappers.length = 0;
  });

  describe('isOpen', () => {
    it("is true only when the route query matches this overlay's id", async () => {
      const router = await buildRouter({ [OVERLAY_QUERY_KEY]: 'totals' });
      const { overlay: totals } = mountOverlay(router, 'totals');
      const { overlay: exportOverlay } = mountOverlay(router, 'export');

      expect(totals.isOpen.value).toBe(true);
      expect(exportOverlay.isOpen.value).toBe(false);
    });

    it('is false when there is no overlay query at all', async () => {
      const router = await buildRouter();
      const { overlay } = mountOverlay(router, 'totals');

      expect(overlay.isOpen.value).toBe(false);
    });
  });

  describe('open', () => {
    it('pushes the overlay query when no overlay is currently open', async () => {
      const router = await buildRouter();
      const pushSpy = vi.spyOn(router, 'push');
      const { overlay } = mountOverlay(router, 'totals');

      overlay.open();
      await flushPromises();

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/g/1',
        query: { [OVERLAY_QUERY_KEY]: 'totals' },
      });
      expect(router.currentRoute.value.query[OVERLAY_QUERY_KEY]).toBe('totals');
    });

    it('replaces, not pushes, when a different overlay is already open', async () => {
      const router = await buildRouter({ [OVERLAY_QUERY_KEY]: 'export' });
      const pushSpy = vi.spyOn(router, 'push');
      const replaceSpy = vi.spyOn(router, 'replace');
      const { overlay } = mountOverlay(router, 'totals');

      overlay.open();
      await flushPromises();

      expect(replaceSpy).toHaveBeenCalledWith({
        path: '/g/1',
        query: { [OVERLAY_QUERY_KEY]: 'totals' },
      });
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('no-ops when this overlay is already open', async () => {
      const router = await buildRouter({ [OVERLAY_QUERY_KEY]: 'totals' });
      const pushSpy = vi.spyOn(router, 'push');
      const replaceSpy = vi.spyOn(router, 'replace');
      const { overlay } = mountOverlay(router, 'totals');

      overlay.open();
      await flushPromises();

      expect(pushSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('delegates to goBackTo with the query-stripped path, preserving other query keys', async () => {
      const router = await buildRouter({
        [OVERLAY_QUERY_KEY]: 'totals',
        foo: 'bar',
      });
      const { overlay } = mountOverlay(router, 'totals');

      overlay.close();

      expect(goBackTo).toHaveBeenCalledTimes(1);
      expect(goBackTo).toHaveBeenCalledWith(router, {
        path: '/g/1',
        query: { foo: 'bar' },
      });
    });

    it('no-ops when this overlay is already closed', async () => {
      const router = await buildRouter();
      const { overlay } = mountOverlay(router, 'totals');

      overlay.close();

      expect(goBackTo).not.toHaveBeenCalled();
    });
  });

  describe('closeBeforeLeaving', () => {
    it('always replaces with the query-stripped target, regardless of state', async () => {
      const router = await buildRouter({ [OVERLAY_QUERY_KEY]: 'delete' });
      const replaceSpy = vi
        .spyOn(router, 'replace')
        .mockResolvedValue(undefined as never);
      const { overlay } = mountOverlay(router, 'delete');

      await overlay.closeBeforeLeaving();

      expect(replaceSpy).toHaveBeenCalledWith({ path: '/g/1', query: {} });
      // closeBeforeLeaving never pops — the whole point is to drop this
      // overlay's entry instead of consuming it with a pop (see useExpenseForm
      // and useSettleUpForm's delete flows).
      expect(goBackTo).not.toHaveBeenCalled();
    });
  });

  describe('Escape key', () => {
    it('closes the overlay when it is open', async () => {
      const router = await buildRouter({ [OVERLAY_QUERY_KEY]: 'totals' });
      mountOverlay(router, 'totals');

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();

      expect(goBackTo).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the overlay is closed', async () => {
      const router = await buildRouter();
      mountOverlay(router, 'totals');

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();

      expect(goBackTo).not.toHaveBeenCalled();
    });
  });
});
