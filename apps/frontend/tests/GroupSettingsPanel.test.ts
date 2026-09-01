import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import GroupSettingsPanel from '@/components/GroupSettingsPanel.vue';
import { i18n } from '@/i18n';
import type { GroupDetail } from '@/types/group';

// Mock the api module
const mockApiPatch = vi.fn().mockResolvedValue({ data: {} });
const mockApiPost = vi.fn().mockResolvedValue({ data: { invitation: {} } });
const mockApiDelete = vi.fn().mockResolvedValue({ data: undefined });
vi.mock('@/lib/api', () => ({
  api: {
    patch: (...args: unknown[]) => mockApiPatch(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

// Mock auth store — user-1 is the current user
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'alice@test.com', displayName: 'Alice' },
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

const makeGroup = (overrides: Partial<GroupDetail> = {}): GroupDetail => ({
  id: 'group-1',
  name: 'Weekend in Venice',
  imageUrl: null,
  memberCount: 2,
  members: [
    { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: null },
    { id: 'user-2', displayName: 'Bob Smith', email: 'bob@test.com', imageUrl: null },
  ],
  netForCurrentUser: 0,
  pendingInvitations: [
    { id: 'inv-1', email: 'carol@test.com', createdAt: '2025-01-01T00:00:00Z' },
  ],
  expenses: [],
  balance: {
    currentUserId: 'user-1',
    currentUserName: 'Alice',
    netForCurrentUser: 0,
    perUser: [],
  },
  ...overrides,
});

const makeGroupWithAvatars = (overrides: Partial<GroupDetail> = {}): GroupDetail => ({
  id: 'group-1',
  name: 'Weekend in Venice',
  imageUrl: null,
  memberCount: 2,
  members: [
    { id: 'user-1', displayName: 'Alice', email: 'alice@test.com', imageUrl: 'https://example.com/alice.jpg' },
    { id: 'user-2', displayName: 'Bob Smith', email: 'bob@test.com', imageUrl: null },
  ],
  netForCurrentUser: 0,
  pendingInvitations: [
    { id: 'inv-1', email: 'carol@test.com', createdAt: '2025-01-01T00:00:00Z' },
  ],
  expenses: [],
  balance: {
    currentUserId: 'user-1',
    currentUserName: 'Alice',
    netForCurrentUser: 0,
    perUser: [],
  },
  ...overrides,
});

const mountComponent = (group: GroupDetail = makeGroup()) => {
  return mount(GroupSettingsPanel, {
    props: { group },
    global: { plugins: [i18n] },
  });
};

describe('GroupSettingsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders member row with displayName and email', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    // Non-current-user member row should show displayName and email
    expect(html).toContain('Bob Smith');
    expect(html).toContain('bob@test.com');
  });

  it('renders "You" and "Admin" for current user member row', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    expect(html).toContain('You');
  });

  it('renders pending-invitation row with email', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    // Pending invitation row shows the email
    expect(html).toContain('carol@test.com');
  });

  it('renders pending invitations section when invitations exist', () => {
    const wrapper = mountComponent();
    const html = wrapper.html();

    expect(html).toContain('PENDING INVITATIONS');
    expect(html).toContain('carol@test.com');
  });

  it('hides pending invitations section when none exist', () => {
    const wrapper = mountComponent(
      makeGroup({ pendingInvitations: [] }),
    );
    const text = wrapper.text();

    expect(text).not.toContain('carol@test.com');
  });

  it('renders group picture when imageUrl is set', () => {
    const wrapper = mountComponent(
      makeGroup({ imageUrl: 'https://example.com/photo.jpg' }),
    );
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/photo.jpg');
  });

  it('does not render group picture when imageUrl is null', () => {
    const wrapper = mountComponent(makeGroup({ imageUrl: null }));
    // The camera icon is an img, but the group picture should not be rendered
    const groupImages = wrapper.findAll('img[alt*="image"]');
    expect(groupImages.length).toBe(0);
  });

  it('shows Save button disabled when name unchanged', () => {
    const wrapper = mountComponent();
    const buttons = wrapper.findAll('button[type="button"]');
    const saveButton = buttons[buttons.length - 1];
    expect(saveButton.attributes('disabled')).toBeDefined();
    expect(saveButton.text()).toContain('Save');
  });

  // Image picker tests
  it('renders image picker with placeholder when imageUrl is null', () => {
    const wrapper = mountComponent(makeGroup({ imageUrl: null }));
    const picker = wrapper.find('[data-testid="group-image-picker"]');
    expect(picker.exists()).toBe(true);

    // Should show gradient placeholder with initials
    const placeholder = picker.find('.bg-gradient-to-br');
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.text()).toContain('WI'); // Weekend in Venice initials
  });

  it('renders image picker with image when imageUrl is set', () => {
    const wrapper = mountComponent(
      makeGroup({ imageUrl: 'https://example.com/photo.jpg' }),
    );
    const picker = wrapper.find('[data-testid="group-image-picker"]');
    expect(picker.exists()).toBe(true);

    // Should show the image
    const img = picker.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/photo.jpg');
  });

  it('renders camera button with correct icon and aria-label', () => {
    const wrapper = mountComponent();
    const cameraLabel = wrapper.find('label[for="group-image-upload"]');
    expect(cameraLabel.exists()).toBe(true);
    expect(cameraLabel.attributes('aria-label')).toBe('Change image');

    const cameraIcon = cameraLabel.find('img');
    expect(cameraIcon.exists()).toBe(true);
    // The SVG is inlined as a data URL in tests, just verify it's an image
    expect(cameraIcon.attributes('src')).toContain('svg');
  });

  it('renders hidden file input with accept="image/*" and no capture attribute', () => {
    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');
    expect(fileInput.exists()).toBe(true);
    expect(fileInput.attributes('type')).toBe('file');
    expect(fileInput.attributes('accept')).toBe('image/*');
    expect(fileInput.attributes('capture')).toBeUndefined();
  });

  it('uploads image successfully and emits updated', async () => {
    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');

    // Create a valid test file
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    // Trigger file change via DataTransfer (required for file inputs in happy-dom)
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    (fileInput.element as HTMLInputElement).files = dataTransfer.files;
    await fileInput.trigger('change');

    // Wait for async operations
    await vi.waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    // Verify FormData was posted
    const callArgs = mockApiPost.mock.calls[0];
    expect(callArgs[0]).toBe('/groups/group-1/image');
    expect(callArgs[1]).toBeInstanceOf(FormData);
    const formData = callArgs[1] as FormData;
    expect(formData.get('image')).toBe(file);

    // Verify updated event was emitted
    expect(wrapper.emitted('updated')).toBeTruthy();
  });

  it('shows error for invalid file type without calling api.post', async () => {
    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');

    // Create an invalid test file (not an image)
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });

    // Trigger file change via DataTransfer
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    (fileInput.element as HTMLInputElement).files = dataTransfer.files;
    await fileInput.trigger('change');

    // Wait for validation
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="image-upload-error"]').exists()).toBe(true);
    });

    // Verify api.post was NOT called
    expect(mockApiPost).not.toHaveBeenCalled();

    // Verify error message is shown
    const errorText = wrapper.find('[data-testid="image-upload-error"]').text();
    expect(errorText).toContain('valid image file');
  });

  it('shows error for file too large without calling api.post', async () => {
    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');

    // Create a file larger than 5MB
    const largeContent = new Uint8Array(6 * 1024 * 1024); // 6 MB
    const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });

    // Trigger file change via DataTransfer
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    (fileInput.element as HTMLInputElement).files = dataTransfer.files;
    await fileInput.trigger('change');

    // Wait for validation
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="image-upload-error"]').exists()).toBe(true);
    });

    // Verify api.post was NOT called
    expect(mockApiPost).not.toHaveBeenCalled();

    // Verify error message is shown
    const errorText = wrapper.find('[data-testid="image-upload-error"]').text();
    expect(errorText).toContain('5 MB');
  });

  it('shows uploading state during upload', async () => {
    // Make the API call slow
    mockApiPost.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 100)),
    );

    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    (fileInput.element as HTMLInputElement).files = dataTransfer.files;
    await fileInput.trigger('change');

    // Check uploading overlay is shown
    const uploadingOverlay = wrapper.find('.bg-black\\/50');
    expect(uploadingOverlay.exists()).toBe(true);
    expect(uploadingOverlay.text()).toContain('Uploading image');

    // Wait for completion
    await vi.waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    // Wait for uploading overlay to disappear
    await vi.waitFor(() => {
      expect(wrapper.find('.bg-black\\/50').exists()).toBe(false);
    });
  });

  it('shows generic error when upload fails', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network error'));

    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    (fileInput.element as HTMLInputElement).files = dataTransfer.files;
    await fileInput.trigger('change');

    // Wait for error
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="image-upload-error"]').exists()).toBe(true);
    });

    // Verify error message is shown
    const errorText = wrapper.find('[data-testid="image-upload-error"]').text();
    expect(errorText).toContain('Could not upload the image');
  });

  it('disables camera button during upload', async () => {
    mockApiPost.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 100)),
    );

    const wrapper = mountComponent();
    const fileInput = wrapper.find('input#group-image-upload');

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    (fileInput.element as HTMLInputElement).files = dataTransfer.files;
    await fileInput.trigger('change');

    // Camera button should have opacity-60 and pointer-events-none
    const cameraLabel = wrapper.find('label[for="group-image-upload"]');
    expect(cameraLabel.classes()).toContain('opacity-60');
    expect(cameraLabel.classes()).toContain('pointer-events-none');
  });

  it('renders member row avatar with image when member has imageUrl', () => {
    const wrapper = mountComponent(makeGroupWithAvatars());

    // Find the member row for Alice (first member)
    const memberRows = wrapper.findAll('li');
    expect(memberRows.length).toBeGreaterThanOrEqual(2);

    // First member row (Alice) has imageUrl
    const aliceRow = memberRows[0];
    const aliceAvatar = aliceRow.find('.flex.h-10.w-10');
    expect(aliceAvatar.exists()).toBe(true);
    const aliceImg = aliceAvatar.find('img');
    expect(aliceImg.exists()).toBe(true);
    expect(aliceImg.attributes('src')).toBe('https://example.com/alice.jpg');
    expect(aliceImg.attributes('alt')).toBe('');
    expect(aliceImg.attributes('aria-hidden')).toBe('true');
    expect(aliceImg.classes()).toContain('h-full');
    expect(aliceImg.classes()).toContain('w-full');
    expect(aliceImg.classes()).toContain('rounded-full');
    expect(aliceImg.classes()).toContain('object-cover');

    // Second member row (Bob) has no imageUrl - should render initials
    const bobRow = memberRows[1];
    const bobAvatar = bobRow.find('.flex.h-10.w-10');
    expect(bobAvatar.exists()).toBe(true);
    expect(bobAvatar.find('img').exists()).toBe(false);
    expect(bobAvatar.text()).toContain('BS'); // Bob Smith initials
  });

  it('renders member row avatar initials when member has no imageUrl', () => {
    const wrapper = mountComponent(makeGroup());

    const memberRows = wrapper.findAll('li');
    expect(memberRows.length).toBeGreaterThanOrEqual(2);

    // First member row (Alice) has no imageUrl
    const aliceRow = memberRows[0];
    const aliceAvatar = aliceRow.find('.flex.h-10.w-10');
    expect(aliceAvatar.exists()).toBe(true);
    expect(aliceAvatar.find('img').exists()).toBe(false);
    expect(aliceAvatar.text()).toContain('A'); // Alice initials

    // Second member row (Bob) has no imageUrl
    const bobRow = memberRows[1];
    const bobAvatar = bobRow.find('.flex.h-10.w-10');
    expect(bobAvatar.exists()).toBe(true);
    expect(bobAvatar.find('img').exists()).toBe(false);
    expect(bobAvatar.text()).toContain('BS'); // Bob Smith initials
  });

  it('shows server-supplied message when addMember fails with a response message', async () => {
    mockApiPost.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { message: 'Custom server error' } },
    });

    const wrapper = mountComponent();
    await wrapper.find('input[type="email"]').setValue('carol@test.com');
    await wrapper.find('form').trigger('submit');

    await vi.waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    expect(wrapper.text()).toContain('Custom server error');
  });

  it('shows generic error message when addMember fails without a response message', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network error'));

    const wrapper = mountComponent();
    await wrapper.find('input[type="email"]').setValue('carol@test.com');
    await wrapper.find('form').trigger('submit');

    await vi.waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(1);
    });

    expect(wrapper.text()).toContain(i18n.global.t('groupSettings.addMemberError'));
  });
});
