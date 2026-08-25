import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage } from '../pages';
import { resolve } from 'node:path';

const FIXTURE_PATH = resolve('tests/e2e/fixtures/test-image.png');

test('group image: upload in settings → appears on group card → persists after reload', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);

  // 1. Navigate to /groups and create a group
  await page.goto('/groups');
  const groupName = 'e2e-group-image-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  // 2. Open group detail and navigate to settings
  await groupsPage.openGroup(groupName);
  const groupId = page.url().split('/').pop();
  expect(groupId).toBeTruthy();
  await page.goto('/groups/' + groupId + '/settings');

  // 3. Verify image edit button is visible and contains camera icon (may be inlined as data: URL)
  await expect(groupSettingsPage.imageEditButton).toBeVisible();
  await expect(groupSettingsPage.imageEditButton.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);

  // 4. Upload image via hidden file input
  await groupSettingsPage.imageInput.setInputFiles(FIXTURE_PATH);

  // 5. Preview image shows the uploaded image (data: URL) - backend may convert to webp
  await expect(groupSettingsPage.previewImage).toBeVisible();
  await expect(groupSettingsPage.previewImage).toHaveAttribute('src', /^data:image\/(png|webp);base64,/);

  // 6. Go back to groups list and verify group card shows the image
  await page.goto('/groups');
  await groupsPage.expectGroupVisible(groupName);

  // The group card should now show an <img> with the uploaded image (not the gradient placeholder)
  const groupCard = page.locator('li', { has: page.getByRole('heading', { name: groupName, level: 2 }) });
  await expect(groupCard.locator('img').first()).toBeVisible();
  await expect(groupCard.locator('img').first()).toHaveAttribute('src', /^data:image\/(png|webp);base64,/);
  // Gradient thumbnail should not be visible when image is set
  await expect(groupCard.locator('div[aria-label*="thumbnail"]')).not.toBeVisible();

  // 7. Reload and verify persistence
  await page.reload();
  await groupsPage.expectGroupVisible(groupName);
  const groupCardAfterReload = page.locator('li', { has: page.getByRole('heading', { name: groupName, level: 2 }) });
  await expect(groupCardAfterReload.locator('img').first()).toBeVisible();
  await expect(groupCardAfterReload.locator('img').first()).toHaveAttribute('src', /^data:image\/(png|webp);base64,/);
});
