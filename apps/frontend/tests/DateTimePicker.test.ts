import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import DateTimePicker from '@/components/DateTimePicker.vue';

// Stub DatePicker (from v-calendar) as a simple passthrough that renders the
// v-model value and emits nothing on its own. The unit test asserts WRAPPER
// behavior (Apply/Cancel discipline, trigger formatting), not v-calendar
// internals.
const stubDatePicker = {
  name: 'DatePicker',
  props: { modelValue: String },
  template: `<div class="stub-dp" @click="$emit('update:modelValue', modelValue)">{{ modelValue }}</div>`,
};

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(DateTimePicker, {
    props: { modelValue: '2024-01-15', ...props },
    global: {
      stubs: {
        DatePicker: stubDatePicker,
        // Stub Teleport as a passthrough so the teleported sheet content is
        // rendered inside the wrapper's html() for assertions.
        Teleport: {
          template: '<div class="teleport-stub"><slot /></div>',
        },
      },
    },
  });
}

describe('DateTimePicker', () => {
  it('renders the trigger with the formatted date', () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    const html = wrapper.html();
    // 2024-01-15 is a Monday → "Mon, Jan 15"
    expect(html).toContain('Mon, Jan 15');
    expect(html).toContain('Date');
  });

  it('renders a calendar icon and a chevron-down icon in the trigger', () => {
    const wrapper = mountPicker({ modelValue: '2024-10-15' });

    const trigger = wrapper.find('[data-test-id="dtp"]');
    expect(trigger.exists()).toBe(true);

    const svgs = trigger.findAll('svg');
    // Calendar icon + chevron-down icon (the sheet close-X is outside the trigger).
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg.classes().join(' ')).toContain('text-[#C8C4D7]');
    }

    expect(trigger.html()).toContain('Oct 15');
  });

  it('Apply emits update:modelValue with the draft value', async () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    // Open the bottom sheet by clicking the trigger.
    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    // Find the Apply button inside the teleported sheet.
    const buttons = wrapper.findAll('button');
    const apply = buttons.find((b) => b.text().trim() === 'Apply');
    expect(apply).toBeTruthy();
    await apply!.trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted).toEqual([['2024-01-15']]);
  });

  it('reveals Cancel and Apply buttons when the sheet is open', async () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    // Sheet is closed initially — footer buttons absent.
    expect(wrapper.html()).not.toContain('Apply');

    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    const html = wrapper.html();
    expect(html).toContain('Cancel');
    expect(html).toContain('Apply');
  });

  it('Cancel does NOT emit update:modelValue', async () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('button');
    const cancel = buttons.find((b) => b.text().trim() === 'Cancel');
    expect(cancel).toBeTruthy();
    await cancel!.trigger('click');

    // No update:modelValue should have been emitted at any point.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    // close IS emitted on Cancel.
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('renders without throwing when modelValue is empty', () => {
    expect(() => mountPicker({ modelValue: '' })).not.toThrow();
  });

  it('Cancel discards an in-flight draft change (no update:modelValue emitted)', async () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    // Simulate the user picking a day in the calendar — v-calendar day cells
    // update the wrapper's internal draft ref via v-model.
    const dayCells = wrapper.findAll('.vc-day-content');
    if (dayCells.length > 0) {
      await dayCells[0].trigger('click');
      await wrapper.vm.$nextTick();
    }

    const buttons = wrapper.findAll('button');
    const cancel = buttons.find((b) => b.text().trim() === 'Cancel');
    expect(cancel).toBeTruthy();
    await cancel!.trigger('click');

    // Cancel must NOT emit update:modelValue — any in-flight draft is discarded.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('shows a pre-set modelValue and Apply re-emits it without navigation', async () => {
    const wrapper = mountPicker({ modelValue: '2024-06-15' });

    // 2024-06-15 is a Saturday → "Sat, Jun 15"
    const html = wrapper.html();
    expect(html).toContain('Sat, Jun 15');

    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('button');
    const apply = buttons.find((b) => b.text().trim() === 'Apply');
    expect(apply).toBeTruthy();
    await apply!.trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted).toEqual([['2024-06-15']]);
  });

  it('renders the action row with Cancel before Apply', async () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    // The footer action row uses `flex justify-end gap-2 …`.
    const actionRow = wrapper.find('.flex.justify-end.gap-2');
    expect(actionRow.exists()).toBe(true);

    const rowButtons = actionRow.findAll('button');
    expect(rowButtons).toHaveLength(2);
    expect(rowButtons[0].text().trim()).toBe('Cancel');
    expect(rowButtons[1].text().trim()).toBe('Apply');
  });

  it('scrim click emits close but NOT update:modelValue', async () => {
    const wrapper = mountPicker({ modelValue: '2024-01-15' });

    await wrapper.find('[data-test-id="dtp"]').trigger('click');
    await wrapper.vm.$nextTick();

    // The scrim is the first direct child div of the dialog.
    const scrim = wrapper.find('[role="dialog"] > div');
    expect(scrim.exists()).toBe(true);
    await scrim.trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
