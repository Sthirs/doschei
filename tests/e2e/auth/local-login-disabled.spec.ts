import { expect, test } from '@playwright/test';

// Skip unless explicitly testing the disabled-login UI.
// Run with: PLAYWRIGHT_LOCAL_LOGIN_DISABLED=true npx playwright test local-login-disabled
const isDisabled = process.env.PLAYWRIGHT_LOCAL_LOGIN_DISABLED === 'true';

(isDisabled ? test : test.skip)(
  'LoginView hides password form when local login is disabled',
  async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel('Email')).not.toBeVisible();
    await expect(page.getByLabel('Password')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).not.toBeVisible();
  },
);
