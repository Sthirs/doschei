// The document-level listener bails out when `triggerRef` or `panelRef` is
// null, so a broken template-ref binding leaves the panel open instead of
// throwing — a silent failure no other CategoryPicker test would catch.
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import CategoryPicker from '@/components/CategoryPicker.vue';
import { i18n } from '@/i18n';

describe('CategoryPicker outside-click dismissal (template ref binding)', () => {
  it('closes the panel when a click lands outside trigger and panel', async () => {
    const wrapper = mount(CategoryPicker, {
      props: { modelValue: 'general' },
      attachTo: document.body,
      global: {
        plugins: [i18n],
        stubs: {
          Teleport: { template: '<div class="teleport-stub"><slot /></div>' },
        },
      },
    });

    await wrapper.find('button[aria-label^="Category:"]').trigger('click');
    await flushPromises();
    expect(
      wrapper.find('[role="dialog"][aria-label="Select category"]').exists(),
    ).toBe(true);

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(
      wrapper.find('[role="dialog"][aria-label="Select category"]').exists(),
    ).toBe(false);

    outside.remove();
    wrapper.unmount();
  });
});
