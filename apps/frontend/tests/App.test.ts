import { mount } from '@vue/test-utils';

import App from '../src/App.vue';

describe('App', () => {
  it('renders router outlet shell', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
        },
      },
    });

    expect(wrapper.html()).toContain('router-view-stub');
  });
});
