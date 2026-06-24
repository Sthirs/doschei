import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import App from '../src/App.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({
    meta: {
      requiresAuth: false,
    },
  }),
  createRouter: (options: any) => ({
    beforeEach: vi.fn(),
  }),
  createWebHistory: () => ({}),
}));

describe('App', () => {
  it('renders router outlet shell', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          AppTopbar: true,
        },
      },
    });

    expect(wrapper.html()).toContain('router-view-stub');
  });
});
