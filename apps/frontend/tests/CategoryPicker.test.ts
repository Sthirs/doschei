import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import CategoryPicker from '@/components/CategoryPicker.vue';

function mountPicker(props: Record<string, unknown> = {}) {
  return mount(CategoryPicker, {
    props: { modelValue: 'general', ...props },
    global: {
      stubs: {
        Teleport: {
          template: '<div class="teleport-stub"><slot /></div>',
        },
      },
    },
  });
}

async function openPanel(wrapper: ReturnType<typeof mountPicker>) {
  const trigger = wrapper.find('button[aria-label^="Category:"]');
  await trigger.trigger('click');
  await flushPromises();
}

function getSearchInput(wrapper: ReturnType<typeof mountPicker>) {
  const inputs = wrapper.findAll<HTMLInputElement>('input[aria-label="Search categories"]');
  return inputs[0];
}

function getDesktopPanel(wrapper: ReturnType<typeof mountPicker>) {
  return wrapper.find('[role="dialog"][aria-label="Select category"]');
}

describe('CategoryPicker search/filter', () => {
  it('opens panel with full grouped grid when query empty', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(true);

    const panelHtml = panel.html();
    expect(panelHtml).toContain('Food &amp; Drink');
    expect(panelHtml).toContain('Transportation');
    expect(panelHtml).toContain('Home');
    expect(panelHtml).toContain('Life');
    expect(panelHtml).toContain('Utilities');
    expect(panelHtml).toContain('Entertainment');
    expect(panelHtml).toContain('Uncategorized');

    expect(panelHtml).toContain('Groceries');
    expect(panelHtml).toContain('Rent');
    expect(panelHtml).toContain('General');
  });

  it('typing "groce" filters to Groceries only', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.setValue('groce');
    await flushPromises();

    const panel = getDesktopPanel(wrapper);
    const panelHtml = panel.html();
    expect(panelHtml).toContain('Groceries');
    expect(panelHtml).not.toContain('Dining Out');
    expect(panelHtml).not.toContain('Liquor');
    expect(panelHtml).not.toContain('Rent');
    expect(panelHtml).not.toContain('Uncategorized');
  });

  it('family-name query "utilities" shows that family\'s entries', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.setValue('utilities');
    await flushPromises();

    const panel = getDesktopPanel(wrapper);
    const panelHtml = panel.html();
    expect(panelHtml).toContain('Utilities');
    expect(panelHtml).toContain('Electricity');
    expect(panelHtml).toContain('Water');
    expect(panelHtml).toContain('Cleaning');
    expect(panelHtml).not.toContain('Food &amp; Drink');
    expect(panelHtml).not.toContain('Groceries');
    expect(panelHtml).not.toContain('Rent');
  });

  it('zero-match query shows the role="status" text', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.setValue('xyznonexistent');
    await flushPromises();

    const statusText = wrapper.find('[role="status"]');
    expect(statusText.exists()).toBe(true);
    expect(statusText.text()).toBe('No matching category');
  });

  it('Enter selects first visible match, emits update:modelValue, and closes', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.setValue('groce');
    await flushPromises();

    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['groceries']);

    const panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(false);
  });

  it('Enter with empty query emits nothing', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeFalsy();

    const panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(true);
  });

  it('Escape clears non-empty query keeping panel open; second Escape closes', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.setValue('groce');
    await flushPromises();

    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(input.element.value).toBe('');
    let panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(true);

    const panelHtml = panel.html();
    expect(panelHtml).toContain('Food &amp; Drink');
    expect(panelHtml).toContain('Rent');

    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(false);
  });

  it('reopening resets query to empty', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const input = getSearchInput(wrapper);
    await input.setValue('groce');
    await flushPromises();

    await input.trigger('keydown', { key: 'Escape' });
    await input.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    let panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(false);

    await openPanel(wrapper);

    const newInput = getSearchInput(wrapper);
    expect(newInput.element.value).toBe('');

    const newPanel = getDesktopPanel(wrapper);
    const panelHtml = newPanel.html();
    expect(panelHtml).toContain('Food &amp; Drink');
    expect(panelHtml).toContain('Rent');
  });

  it('grid button click still emits update:modelValue (contract regression)', async () => {
    const wrapper = mountPicker();
    await openPanel(wrapper);

    const buttons = wrapper.findAll('button[type="button"]');
    const groceriesButton = buttons.find((btn) =>
      btn.text().includes('Groceries'),
    );
    expect(groceriesButton).toBeTruthy();

    await groceriesButton!.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['groceries']);

    const panel = getDesktopPanel(wrapper);
    expect(panel.exists()).toBe(false);
  });
});
