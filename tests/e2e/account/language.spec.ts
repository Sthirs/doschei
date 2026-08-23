import { test, expect } from '../fixtures/auth';
import { AccountPage } from '../pages/AccountPage';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const TOKEN_KEY = 'doschei.auth.token';

/**
 * Restore the demo user's profile (language + display name) via the API so
 * sibling suites are not polluted by the Italian switch.
 */
async function restoreDemoProfile(page: import('@playwright/test').Page) {
  const token = await page.evaluate((key: string) => localStorage.getItem(key), TOKEN_KEY);
  if (!token) return;

  await fetch(`${baseURL}/api/auth/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName: 'Demo User', language: 'en' }),
  });
}

test.describe('account language selection (EN → IT via Save)', () => {
  test.afterEach(async ({ authenticatedPage: page }) => {
    await restoreDemoProfile(page);
  });

  test('language applies only after Save; persists across reload and re-login', async ({
    authenticatedPage: page,
  }) => {
    const account = new AccountPage(page);
    await page.goto('/account');

    // Sanity: the account screen starts in English.
    await expect(page.getByTestId('account-details')).toBeVisible();
    await expect(page.getByText('Account Details')).toBeVisible();
    await expect(account.languageSelect).toHaveValue('en');

    // Selecting Italiano alone must NOT translate nor save anything yet.
    await account.selectLanguage('it');
    await expect(page.getByText('Dettagli account')).toHaveCount(0);
    await expect(page.getByText('Account Details')).toBeVisible();

    // Pressing Save persists AND applies the new locale.
    await page.getByTestId('account-save').click();
    await expect(page.getByText('Dettagli account')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(account.languageSelect).toHaveValue('it');
    await expect(page.getByRole('button', { name: 'Salva modifiche' })).toBeVisible();
    await expect(page.locator('#account-name')).toHaveAttribute('placeholder', 'Nome completo');

    // Reload — the server-side preference keeps the Italian UI.
    await page.reload();
    await expect(page.getByText('Dettagli account')).toBeVisible();
    await expect(account.languageSelect).toHaveValue('it');

    // Groups screen renders the localized balance chips.
    // NB: Intl 'it' renders EUR as "40,00 €" — do not pin the English amount shape here.
    await page.goto('/groups');
    await expect(page.getByText(/Ti devono|Devi |Pari/).first()).toBeVisible();

    // Log out (Sign Out lives on the account screen), log back in —
    // the saved preference survives the session.
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Esci' })).toBeVisible();
    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.locator('#email').fill('demo@doschei.local');
    await page.locator('#password').fill('password123');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL(/\/groups/, { timeout: 15000 });

    await page.goto('/account');
    await expect(page.getByText('Dettagli account')).toBeVisible();
    await expect(account.languageSelect).toHaveValue('it');

    // Switch back to English: select + Save (Italian button label while in IT).
    await account.selectLanguage('en');
    await page.getByRole('button', { name: 'Salva modifiche' }).click();
    await expect(page.getByText('Account Details')).toBeVisible();
    await expect(account.languageSelect).toHaveValue('en');
  });
});
