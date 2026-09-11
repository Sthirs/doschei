import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';

import GroupDetailView from '@/views/GroupDetailView.vue';
import { i18n } from '@/i18n';
import { api } from '@/lib/api';

// This file exists because GroupDetailView.test.ts mocks vue-router with a
// static `push: vi.fn()` — fine for asserting forward navigations, but the
// Totals/Export overlays are now real `?overlay=<id>` navigations
// (useRoutedOverlay, ADR-0024), so opening one needs a router whose `route`
// is genuinely reactive. A real memory-history router gives that for free.
function getDefaultGroup() {
  return {
    id: 'group-1',
    name: 'Test Group',
    imageUrl: null,
    memberCount: 2,
    members: [
      { id: 'user-1', displayName: 'Alice', email: 'alice@test.com' },
      { id: 'user-2', displayName: 'Bob', email: 'bob@test.com' },
    ],
    expenses: [],
    balance: {
      currentUserId: 'user-1',
      currentUserName: 'Alice',
      netForCurrentUser: 0,
      perUser: [],
    },
  };
}

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { group: getDefaultGroup() } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const mocks = vi.hoisted(() => ({
  sharedGroup: { value: null as any },
}));
vi.mock('@/router', () => ({
  currentPageTitle: ref('Test Group'),
  sharedGroup: mocks.sharedGroup,
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

async function buildRouter(initialPath: string): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/groups', name: 'groups', component: { template: '<div />' } },
      { path: '/groups/:id', name: 'group-detail', component: GroupDetailView },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  return router;
}

async function mountAt(path: string) {
  const router = await buildRouter(path);
  const wrapper = mount(GroupDetailView, {
    global: {
      plugins: [router, i18n],
      stubs: {
        Teleport: true,
        DateTimePicker: true,
        UserPicker: true,
        CategoryPicker: true,
      },
    },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe('GroupDetailView overlay routes', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    (
      api.get as unknown as { mockResolvedValue: (v: unknown) => unknown }
    ).mockResolvedValue({
      data: { group: getDefaultGroup() },
    });
    Object.defineProperty(window, 'history', {
      value: { state: {} },
      writable: true,
      configurable: true,
    });
  });

  it('renders neither dialog when there is no overlay query', async () => {
    const { wrapper } = await mountAt('/groups/group-1');

    expect(wrapper.find('[role="dialog"][aria-label="Totals"]').exists()).toBe(
      false,
    );
    expect(wrapper.html()).not.toContain('Select Period');
  });

  it('clicking Totals pushes ?overlay=totals and renders the Totals dialog', async () => {
    const { wrapper, router } = await mountAt('/groups/group-1');

    const totalsButton = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Totals')!;
    await totalsButton.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.overlay).toBe('totals');
    expect(wrapper.find('[role="dialog"][aria-label="Totals"]').exists()).toBe(
      true,
    );
  });

  // Moved from GroupDetailView.test.ts: opening the Export modal is now a
  // real navigation (?overlay=export), which that file's static router mock
  // cannot reflect back into `showExportModal`.
  it('clicking Export pushes ?overlay=export and renders the export modal with month and year <select>s', async () => {
    const { wrapper, router } = await mountAt('/groups/group-1');

    const exportButton = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Export')!;
    await exportButton.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.overlay).toBe('export');

    const html = wrapper.html();
    expect(html).toContain('Select Period');
    expect(html).toContain('Month');
    expect(html).toContain('Year');
    expect(html).toContain('Export Expenses');

    const selects = wrapper.findAll('select');
    expect(selects).toHaveLength(2);
    expect(selects[0].findAll('option')).toHaveLength(12);
    expect(selects[1].findAll('option')).toHaveLength(5);
  });

  it('a deep link with ?overlay=totals renders the Totals dialog on load', async () => {
    const { wrapper } = await mountAt('/groups/group-1?overlay=totals');

    expect(wrapper.find('[role="dialog"][aria-label="Totals"]').exists()).toBe(
      true,
    );
  });

  it('a deep link with ?overlay=export renders the export modal on load', async () => {
    const { wrapper } = await mountAt('/groups/group-1?overlay=export');

    expect(wrapper.html()).toContain('Select Period');
  });

  it('closing Totals via the X button clears the overlay query', async () => {
    const { wrapper, router } = await mountAt('/groups/group-1?overlay=totals');
    expect(wrapper.find('[role="dialog"][aria-label="Totals"]').exists()).toBe(
      true,
    );

    const closeButton = wrapper
      .find('[role="dialog"][aria-label="Totals"]')
      .findAll('button')
      .find(
        (b) =>
          b.attributes('aria-label') ===
          i18n.global.t('groupDetail.totalsClose'),
      )!;
    await closeButton.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.overlay).toBeUndefined();
    expect(wrapper.find('[role="dialog"][aria-label="Totals"]').exists()).toBe(
      false,
    );
  });

  it('opening Totals then Export replaces rather than stacking a second history entry', async () => {
    const { wrapper, router } = await mountAt('/groups/group-1');

    const totalsButton = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Totals')!;
    await totalsButton.trigger('click');
    await flushPromises();

    const exportButton = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === 'Export')!;
    await exportButton.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.overlay).toBe('export');

    // Switching overlays used `replace`, not `push` (useRoutedOverlay's
    // open()), so there is only ONE overlay entry on top of the base route: a
    // single `back()` clears the query entirely rather than landing on
    // `?overlay=totals` first.
    router.back();
    await flushPromises();

    expect(router.currentRoute.value.query.overlay).toBeUndefined();
  });
});
