// Full Dex OAuth login flow.
// Does NOT use the authenticatedPage fixture — starts unauthenticated and drives the
// entire browser redirect chain: /login → /api/auth/oauth → /dex/auth/local → /groups.
import { expect, test } from '@playwright/test';

test.describe('Dex OAuth login', () => {
  test('signs in via Dex and lands on /groups', async ({ page }) => {
    // 1. Load the login page
    await page.goto('/login');

    // 2. Wait for the OAuth config fetch to complete and the button to render.
    //    LoginView.vue:118-127 renders an <a href="/api/auth/oauth"> with text from
    //    oauthConfig.buttonText ("Sign in with Dex").
    const dexButton = page.getByRole('link', { name: /Sign in with Dex/i });
    await expect(dexButton).toBeVisible({ timeout: 10_000 });

    // 3. Clicking the anchor triggers a full-page navigation through the backend
    //    PKCE redirect to /dex/auth (Dex may settle on /dex/auth/local directly
    //    because enablePasswordDB is the only connector).
    await Promise.all([
      page.waitForURL(/\/dex\/auth/, { timeout: 15_000 }),
      dexButton.click(),
    ]);

    // 4. Dex login form — Dex v2.x defaults: name="login" (email) and name="password".
    const emailInput = page.locator('input[name="login"]');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.fill('admin@doschei.local');
    await page.locator('input[name="password"]').fill('password');

    // 5. Submit the Dex login form. Dex validates credentials then either:
    //    (a) redirects straight to the callback, or
    //    (b) shows a consent/approval screen at /dex/approval first.
    await Promise.all([
      page.waitForURL(/\/dex\/(approval|auth)/, { timeout: 20_000 }),
      page.locator('button[type="submit"]').click(),
    ]);

    // 5b. Handle the Dex consent screen when present.
    //     The approval page renders two submit buttons; click the "Grant Access" one.
    if (page.url().includes('/dex/approval')) {
      await Promise.all([
        page.waitForURL(/\/groups$/, { timeout: 20_000 }),
        page.getByRole('button', { name: /Grant Access/i }).click(),
      ]);
    } else {
      await page.waitForURL(/\/groups$/, { timeout: 20_000 });
    }

    // 6. Assert we landed on /groups and are authenticated.
    //    Matches the assertion style used in tests/e2e/groups/login.guard.spec.ts.
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  });
});
