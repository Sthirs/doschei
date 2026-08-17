import { expect, test } from '@playwright/test';

test.describe('Login UI — visual fidelity', () => {
  test('renders the single-column Figma layout with prefilled demo credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Guard: if OAuth autoLaunch redirected us away, the UI is not visible — skip.
    if (!page.url().includes('/login')) {
      test.skip(true, 'OAuth autoLaunch is enabled — login UI not visible');
      return;
    }

    // Header
    await expect(page.locator('img[src="/logo.svg"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Do Schèi', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bentornato', level: 2 })).toBeVisible();
    await expect(page.getByText('Manage your shared expenses')).toBeVisible();

    // Prefilled demo credentials (real <label> → getByLabel works)
    await expect(page.getByLabel('Email')).toHaveValue('demo@doschei.local');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('password123');

    // Log in button
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

    // Password visibility toggle (functional): starts hidden, click reveals
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');

    // Single-column layout: main has no grid columns
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    const mainClass = await main.getAttribute('class');
    expect(mainClass).not.toContain('grid');
    // No two-column / desktop marketing panel classes anywhere
    const hasGridCols = await page.locator('[class*="lg:grid-cols"]').count();
    expect(hasGridCols).toBe(0);

    // Scope fidelity: no demo-credential box, no sign-up, no forgot-password
    await expect(page.getByText('Demo user')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /sign up/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /forgot password/i })).toHaveCount(0);
  });

  test('OAuth button renders when enabled with dynamic text', async ({ page }) => {
    // Fetch oauth config to know whether the button should render and what text it uses.
    const resp = await page.request.get('/api/auth/oauth/config');
    if (!resp.ok()) {
      test.skip(true, 'OAuth config endpoint unavailable');
      return;
    }
    const oauth = await resp.json();
    if (!oauth.enabled) {
      test.skip(true, 'OAuth disabled in this environment');
      return;
    }

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    if (!page.url().includes('/login')) {
      test.skip(true, 'OAuth autoLaunch enabled — UI not visible');
      return;
    }

    // The OAuth button is an <a href="/api/auth/oauth"> with the dynamic buttonText.
    const oauthLink = page.locator('a[href="/api/auth/oauth"]');
    await expect(oauthLink).toBeVisible();
    await expect(oauthLink).toContainText(oauth.buttonText);
  });
});
