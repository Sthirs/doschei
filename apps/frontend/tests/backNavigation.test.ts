import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Router, RouteLocationRaw } from 'vue-router';

// `createMemoryHistory` (used by other tests in this repo) does NOT populate
// `state.back`, so a hand-rolled fake router is the only way to exercise the
// `state.back` comparison this module is built around.
let goBackTo: typeof import('@/lib/backNavigation').goBackTo;
let goBackOr: typeof import('@/lib/backNavigation').goBackOr;

// Mirrors the two named routes exercised below, closely enough to prove
// `router.resolve()` — not a hand-written path string — drives the
// comparison.
const ROUTE_PATH_TEMPLATES: Record<string, string> = {
  groups: '/groups',
  'group-detail': '/groups/:id',
};

function fakeResolve(to: RouteLocationRaw): { fullPath: string } {
  if (typeof to === 'string') return { fullPath: to };
  if ('path' in to && to.path) return { fullPath: to.path };
  if ('name' in to && to.name) {
    let fullPath = ROUTE_PATH_TEMPLATES[String(to.name)];
    for (const [key, value] of Object.entries(to.params ?? {})) {
      fullPath = fullPath.replace(`:${key}`, String(value));
    }
    return { fullPath };
  }
  throw new Error('unsupported location in test fakeResolve()');
}

type AfterEachCallback = (
  to: unknown,
  from: unknown,
  failure?: unknown,
) => void;

function createFakeRouter(back: string | null) {
  let afterEachCallback: AfterEachCallback | null = null;
  const router = {
    options: { history: { state: { back } } },
    resolve: vi.fn(fakeResolve),
    back: vi.fn(),
    replace: vi.fn().mockResolvedValue(undefined),
    afterEach: vi.fn((cb: AfterEachCallback) => {
      afterEachCallback = cb;
      return () => {};
    }),
  };
  return {
    router: router as unknown as Router,
    raw: router,
    // Simulates vue-router invoking every registered `afterEach` guard once a
    // navigation settles — including a failed one, per vue-router's contract.
    triggerAfterEach: (failure?: unknown) =>
      afterEachCallback?.(undefined, undefined, failure),
  };
}

describe('backNavigation', () => {
  // The pop-in-flight latch is module-level state (by design — there is only
  // ever one production router). Reset the module between tests so no test
  // can observe a latch left `true` by a previous one.
  beforeEach(async () => {
    vi.resetModules();
    ({ goBackTo, goBackOr } = await import('@/lib/backNavigation'));
  });

  describe('goBackTo', () => {
    it('pops when the previous entry matches the resolved target — including a named target with params', () => {
      const { router, raw } = createFakeRouter('/groups/42');

      goBackTo(router, { name: 'group-detail', params: { id: '42' } });

      expect(raw.resolve).toHaveBeenCalledWith({
        name: 'group-detail',
        params: { id: '42' },
      });
      expect(raw.back).toHaveBeenCalledTimes(1);
      expect(raw.replace).not.toHaveBeenCalled();
    });

    it('replaces when there is no previous entry (a deep link)', () => {
      const { router, raw } = createFakeRouter(null);

      goBackTo(router, { name: 'groups' });

      expect(raw.replace).toHaveBeenCalledWith({ name: 'groups' });
      expect(raw.back).not.toHaveBeenCalled();
    });

    it('replaces instead of a blind pop when the previous entry is the post-login redirect target', () => {
      // LoginView pushes the post-login redirect target, so a user who
      // deep-links straight into a form while logged out has
      // `state.back === '/login'`. A blind pop would land back on /login.
      const { router, raw } = createFakeRouter('/login');

      goBackTo(router, { name: 'group-detail', params: { id: '7' } });

      expect(raw.replace).toHaveBeenCalledWith({
        name: 'group-detail',
        params: { id: '7' },
      });
      expect(raw.back).not.toHaveBeenCalled();
    });

    it('ignores a second call while a pop is still in flight (double-tap latch)', () => {
      const { router, raw } = createFakeRouter('/groups');

      goBackTo(router, { name: 'groups' });
      goBackTo(router, { name: 'groups' });

      expect(raw.back).toHaveBeenCalledTimes(1);
    });

    it('clears the latch once afterEach fires — even for a failed navigation — allowing a further pop', () => {
      const { router, raw, triggerAfterEach } = createFakeRouter('/groups');

      goBackTo(router, { name: 'groups' });
      expect(raw.back).toHaveBeenCalledTimes(1);

      triggerAfterEach(new Error('navigation failed'));

      goBackTo(router, { name: 'groups' });
      expect(raw.back).toHaveBeenCalledTimes(2);
    });
  });

  describe('goBackOr', () => {
    it('pops when there is any previous entry, regardless of target', () => {
      const { router, raw } = createFakeRouter('/account');

      goBackOr(router, { name: 'groups' });

      expect(raw.back).toHaveBeenCalledTimes(1);
      expect(raw.replace).not.toHaveBeenCalled();
    });

    it('replaces with the fallback when there is no previous entry', () => {
      const { router, raw } = createFakeRouter(null);

      goBackOr(router, { name: 'groups' });

      expect(raw.replace).toHaveBeenCalledWith({ name: 'groups' });
      expect(raw.back).not.toHaveBeenCalled();
    });
  });
});
