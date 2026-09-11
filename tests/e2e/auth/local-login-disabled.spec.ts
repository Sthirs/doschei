import { expect, test } from '@playwright/test';
import { seedBuildId } from '../fixtures/auth';

// Skip unless explicitly testing the disabled-login UI.
// Run with: PLAYWRIGHT_LOCAL_LOGIN_DISABLED=true npx playwright test local-login-disabled
const isDisabled = process.env.PLAYWRIGHT_LOCAL_LOGIN_DISABLED === 'true';

(isDisabled ? test : test.skip)(
  'LoginView hides password form when local login is disabled',
  async ({ page }) => {
    // Seeded first so main.ts's ADR-0020 "new build detected" check doesn't
    // fire a purge-and-reload mid-flow (see seedBuildId's doc comment in
    // ../fixtures/auth).
    await seedBuildId(page);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel('Email')).not.toBeVisible();
    await expect(page.getByLabel('Password')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).not.toBeVisible();
  },
);
