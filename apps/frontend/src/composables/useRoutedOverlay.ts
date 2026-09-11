import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { goBackTo } from '@/lib/backNavigation';

export const OVERLAY_QUERY_KEY = 'overlay';

/**
 * Represents one dismissable overlay as `?overlay=<id>` on the current
 * route, so the browser Back button closes it with no popstate handling
 * (ADR-0024). Only one overlay is representable at a time, matching the app:
 * no overlay today opens from inside another.
 */
export function useRoutedOverlay(id: string) {
  const route = useRoute();
  const router = useRouter();

  const isOpen = computed(() => route.query[OVERLAY_QUERY_KEY] === id);

  // The rest of the query, with the overlay key removed — used as the
  // target both when this overlay pops itself off and when it is replaced
  // away before leaving the page.
  const restQuery = () => {
    const rest = { ...route.query };
    delete rest[OVERLAY_QUERY_KEY];
    return rest;
  };

  const open = (): void => {
    if (isOpen.value) return;
    const target = {
      path: route.path,
      query: { ...route.query, [OVERLAY_QUERY_KEY]: id },
    };
    // A different overlay is already open: replace so the history layer
    // still holds at most one entry, and one Back press always returns to
    // the bare route rather than through every overlay that was ever open.
    if (route.query[OVERLAY_QUERY_KEY]) {
      void router.replace(target);
    } else {
      void router.push(target);
    }
  };

  // Normal dismiss (X, scrim, Escape): pop the entry `open()` pushed, so no
  // stale forward entry is left behind. If the page was loaded with the
  // overlay already open, there is nothing of ours to pop, and `goBackTo`
  // degrades to `replace`.
  const close = (): void => {
    if (!isOpen.value) return;
    goBackTo(router, { path: route.path, query: restQuery() });
  };

  // Use before navigating away (see the delete-confirm flow): always
  // replace, dropping the overlay entry instead of consuming it with a pop,
  // so the entry beneath becomes current for a later `goBack()`.
  const closeBeforeLeaving = () =>
    router.replace({ path: route.path, query: restQuery() });

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && isOpen.value) close();
  };

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

  return { isOpen, open, close, closeBeforeLeaving };
}
