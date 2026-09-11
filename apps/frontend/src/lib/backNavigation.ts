import type { RouteLocationRaw, Router } from 'vue-router';

/**
 * True while a `router.back()` call is in flight. `router.back()` is
 * fire-and-forget (it does not return a Promise), so without this latch a
 * fast double-tap of a back control pops two history entries instead of one.
 * Cleared by a lazily-installed `afterEach`, which vue-router runs even when
 * the navigation fails, so the latch can never stick.
 */
let popPending = false;
const installedRouters = new WeakSet<Router>();

function ensureLatchClears(router: Router): void {
  if (installedRouters.has(router)) return;
  installedRouters.add(router);
  router.afterEach(() => {
    popPending = false;
  });
}

/**
 * Navigate one level up. Pops the history entry when the previous entry
 * already is the target, so the topbar back arrow and the browser Back
 * button are the same operation (ADR-0024). On a deep link the previous
 * entry is something else (or nothing), so fall back to `replace` — never
 * `push` — and the stack stops growing on the way back.
 */
export function goBackTo(router: Router, target: RouteLocationRaw): void {
  ensureLatchClears(router);
  if (popPending) return;

  const back = router.options.history.state.back;
  if (typeof back === 'string' && back === router.resolve(target).fullPath) {
    popPending = true;
    router.back();
    return;
  }
  void router.replace(target);
}

/**
 * Navigate one level up, popping whenever there is any previous entry at
 * all — unlike `goBackTo`, it does not require the previous entry to match a
 * specific target. Falls back to `replace(fallback)` only when there is
 * nothing to pop (e.g. a deep link straight into this page). Used where the
 * page is reachable from many places, so there is no single expected parent
 * to match against.
 */
export function goBackOr(router: Router, fallback: RouteLocationRaw): void {
  ensureLatchClears(router);
  if (popPending) return;

  const back = router.options.history.state.back;
  if (typeof back === 'string') {
    popPending = true;
    router.back();
    return;
  }
  void router.replace(fallback);
}
