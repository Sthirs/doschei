import { mount } from '@vue/test-utils';

import App from '../src/App.vue';

// Mock vue-router
jest.mock('vue-router', () => ({
  useRoute: () => ({
    meta: {
      requiresAuth: false,
    },
  }),
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
