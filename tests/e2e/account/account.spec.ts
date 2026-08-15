import { test, expect } from '../fixtures/auth';
import { AccountPage } from '../pages/AccountPage';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const TOKEN_KEY = 'doschei.auth.token';
const ORIGINAL_NAME = 'Demo User';

/**
 * Restore the demo user's display name via the API so sibling suites
 * (groups/expenses/settle-up) that rely on 'Demo User' are not polluted.
 */
async function restoreDemoName(page: import('@playwright/test').Page) {
  const token = await page.evaluate((key: string) => localStorage.getItem(key), TOKEN_KEY);
  if (!token) return;

  await fetch(`${baseURL}/api/auth/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName: ORIGINAL_NAME }),
  });
}

test.afterEach(async ({ authenticatedPage: page }) => {
  await restoreDemoName(page);
});

test.afterAll(async () => {
  // Defensive: re-login and PATCH to guarantee the demo name is restored even
  // if afterEach was skipped (e.g. fixture teardown failure).
  const response = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@doschei.local', password: 'password123' }),
  });
  if (response.status !== 200) return;
  const data = (await response.json()) as { token: string };
  if (typeof data.token !== 'string') return;

  await fetch(`${baseURL}/api/auth/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.token}`,
    },
    body: JSON.stringify({ displayName: ORIGINAL_NAME }),
  });
});

test('account page: initials avatar, read-only email, rename persists', async ({
  authenticatedPage: page,
}) => {
  const account = new AccountPage(page);
  await page.goto('/account');

  // Topbar title
  await expect(page.getByText('Account', { exact: true }).first()).toBeVisible();

  // Initial state — demo user "Demo User"
  await expect(account.avatar).toHaveText('D');
  await expect(account.nameHeading).toHaveText('Demo User');
  await expect(account.nameInput).toHaveValue('Demo User');
  await expect(account.emailInput).toHaveValue('demo@doschei.local');
  await expect(account.emailInput).toBeDisabled();

  await account.nameInput.fill('Zoe Example');
  await expect(account.avatar).toHaveText('Z');

  await account.saveButton.click();

  await expect(account.nameHeading).toHaveText('Zoe Example');
  await expect(account.topbarAvatar).toHaveText('Z');

  await page.reload();
  await expect(account.nameInput).toHaveValue('Zoe Example');
});
