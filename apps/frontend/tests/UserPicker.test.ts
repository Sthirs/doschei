import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import UserPicker from '@/components/UserPicker.vue';
import { i18n } from '@/i18n';
import type { GroupMember } from '@/types/group';

const makeMember = (overrides: Partial<GroupMember> = {}): GroupMember => ({
  id: 'user-1',
  displayName: 'Alice',
  email: 'alice@test.com',
  imageUrl: null,
  ...overrides,
});

const mountComponent = (props: { modelValue: string; members: GroupMember[] } = {
  modelValue: '',
  members: [],
}) => {
  return mount(UserPicker, {
    props,
    global: { plugins: [i18n], stubs: { Teleport: true } },
  });
};

describe('UserPicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders initials when member has no imageUrl', () => {
    const members = [makeMember({ id: 'user-1', displayName: 'Alice' })];
    const wrapper = mountComponent({ modelValue: 'user-1', members });

    // Trigger shows initials
    const triggerAvatar = wrapper.find('.flex.h-7.w-7');
    expect(triggerAvatar.exists()).toBe(true);
    expect(triggerAvatar.text()).toContain('A');
    expect(triggerAvatar.find('img').exists()).toBe(false);
  });

  it('renders img when selected member has imageUrl', () => {
    const members = [
      makeMember({ id: 'user-1', displayName: 'Alice', imageUrl: 'https://example.com/alice.jpg' }),
    ];
    const wrapper = mountComponent({ modelValue: 'user-1', members });

    // Trigger shows image
    const triggerAvatar = wrapper.find('.flex.h-7.w-7');
    expect(triggerAvatar.exists()).toBe(true);
    const img = triggerAvatar.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/alice.jpg');
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('aria-hidden')).toBe('true');
    expect(img.classes()).toContain('h-full');
    expect(img.classes()).toContain('w-full');
    expect(img.classes()).toContain('rounded-full');
    expect(img.classes()).toContain('object-cover');
  });

  it('renders initials in desktop dropdown option when member has no imageUrl', async () => {
    const members = [makeMember({ id: 'user-1', displayName: 'Alice' })];
    const wrapper = mountComponent({ modelValue: '', members });

    // Open dropdown
    const trigger = wrapper.find('button[aria-label="Select who paid"]');
    await trigger.trigger('click');

    // Desktop option shows initials
    const optionAvatar = wrapper.find('.max-h-60 .flex.h-7.w-7');
    expect(optionAvatar.exists()).toBe(true);
    expect(optionAvatar.text()).toContain('A');
    expect(optionAvatar.find('img').exists()).toBe(false);
  });

  it('renders img in desktop dropdown option when member has imageUrl', async () => {
    const members = [
      makeMember({ id: 'user-1', displayName: 'Alice', imageUrl: 'https://example.com/alice.jpg' }),
    ];
    const wrapper = mountComponent({ modelValue: '', members });

    // Open dropdown
    const trigger = wrapper.find('button[aria-label="Select who paid"]');
    await trigger.trigger('click');

    // Desktop option shows image
    const optionAvatar = wrapper.find('.max-h-60 .flex.h-7.w-7');
    expect(optionAvatar.exists()).toBe(true);
    const img = optionAvatar.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/alice.jpg');
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('aria-hidden')).toBe('true');
    expect(img.classes()).toContain('h-full');
    expect(img.classes()).toContain('w-full');
    expect(img.classes()).toContain('rounded-full');
    expect(img.classes()).toContain('object-cover');
  });

  it('renders initials in mobile bottom-sheet option when member has no imageUrl', async () => {
    const members = [makeMember({ id: 'user-1', displayName: 'Alice' })];
    const wrapper = mountComponent({ modelValue: '', members });

    // Open dropdown (mobile bottom-sheet is rendered via Teleport to body)
    const trigger = wrapper.find('button[aria-label="Select who paid"]');
    await trigger.trigger('click');

    // Mobile option shows initials (Teleport renders to body, so we check the wrapper's teleported content)
    // The mobile options are in the Teleport, so we need to find them in the wrapper
    const mobileOptions = wrapper.findAll('.fixed.inset-0 .flex.h-7.w-7');
    expect(mobileOptions.length).toBeGreaterThan(0);
    expect(mobileOptions[0].text()).toContain('A');
    expect(mobileOptions[0].find('img').exists()).toBe(false);
  });

  it('renders img in mobile bottom-sheet option when member has imageUrl', async () => {
    const members = [
      makeMember({ id: 'user-1', displayName: 'Alice', imageUrl: 'https://example.com/alice.jpg' }),
    ];
    const wrapper = mountComponent({ modelValue: '', members });

    // Open dropdown
    const trigger = wrapper.find('button[aria-label="Select who paid"]');
    await trigger.trigger('click');

    // Mobile option shows image
    const mobileOptions = wrapper.findAll('.fixed.inset-0 .flex.h-7.w-7');
    expect(mobileOptions.length).toBeGreaterThan(0);
    const img = mobileOptions[0].find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/alice.jpg');
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('aria-hidden')).toBe('true');
    expect(img.classes()).toContain('h-full');
    expect(img.classes()).toContain('w-full');
    expect(img.classes()).toContain('rounded-full');
    expect(img.classes()).toContain('object-cover');
  });

  it('shows placeholder when no member is selected', () => {
    const members = [makeMember({ id: 'user-1', displayName: 'Alice' })];
    const wrapper = mountComponent({ modelValue: '', members });

    // Trigger shows placeholder text
    expect(wrapper.text()).toContain('Select...');
    // No avatar circle when nothing selected
    expect(wrapper.find('.flex.h-7.w-7').exists()).toBe(false);
  });
});
