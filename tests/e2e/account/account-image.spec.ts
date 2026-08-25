import { test, expect } from '../fixtures/auth';
import { AccountPage } from '../pages/AccountPage';
import { resolve } from 'node:path';
import { uniqueValue, registerUserViaApi } from '../fixtures/auth';

const FIXTURE_PATH = resolve('tests/e2e/fixtures/test-image.png');

test('account avatar: upload image → persists after reload', async ({
  pageForUser,
}) => {
  // Use a unique user to avoid polluting the demo user's state
  const user = await registerUserViaApi('avatar-test');
  const page = await pageForUser(user.email, user.password);

  const account = new AccountPage(page);
  await page.goto('/account');

  // Initial state — avatar shows initials (new user has no avatar)
  await expect(account.avatar).toHaveText(user.displayName.charAt(0).toUpperCase());

  // Edit badge is visible and contains an icon
  await expect(account.avatarEditBadge).toBeVisible();
  await expect(account.avatarEditBadge.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);

  // Upload image via hidden file input
  await account.avatarInput.setInputFiles(FIXTURE_PATH);

  // Avatar now shows the uploaded image (data: URL) - backend may convert to webp
  const avatarImg = account.avatar.locator('img');
  await expect(avatarImg).toBeVisible();
  await expect(avatarImg).toHaveAttribute('src', /^data:image\/(png|webp);base64,/);

  // Reload and verify persistence
  await page.reload();
  await expect(account.avatar.locator('img')).toBeVisible();
  await expect(account.avatar.locator('img')).toHaveAttribute('src', /^data:image\/(png|webp);base64,/);
});
