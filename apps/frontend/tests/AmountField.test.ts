import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import AmountField from '@/components/expense-form/AmountField.vue';
import { i18n } from '@/i18n';

function mountField(autofocus: boolean, modelValue: number | '' = '') {
  return mount(AmountField, {
    props: { modelValue, autofocus, 'onUpdate:modelValue': () => {} },
    attachTo: document.body,
    global: { plugins: [i18n] },
  });
}

describe('AmountField autofocus', () => {
  it('focuses the amount input on mount when autofocus is true (create mode)', async () => {
    const wrapper = mountField(true);
    await flushPromises();

    expect(document.activeElement).toBe(wrapper.find('#expense-amount').element);

    wrapper.unmount();
  });

  it('focuses the amount input again on a second mount in the same document', async () => {
    // A bare `autofocus` attribute only works once per Document (the HTML
    // spec's autofocus-processed flag), so this regression test mounts,
    // unmounts, and mounts again to prove focus is re-applied every time.
    const first = mountField(true);
    await flushPromises();
    expect(document.activeElement).toBe(first.find('#expense-amount').element);
    first.unmount();

    const second = mountField(true);
    await flushPromises();
    expect(document.activeElement).toBe(second.find('#expense-amount').element);

    second.unmount();
  });

  it('does not focus the amount input on mount when autofocus is false (edit mode)', async () => {
    const wrapper = mountField(false);
    await flushPromises();

    expect(document.activeElement).not.toBe(wrapper.find('#expense-amount').element);

    wrapper.unmount();
  });
});
