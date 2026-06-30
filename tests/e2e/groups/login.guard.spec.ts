// This is the ONLY spec that drives the UI login path. All other specs use the authenticatedPage fixture from ../fixtures/auth.
import { test, expect } from '@playwright/test';

test('UI login with demo user works', async ({ page }) => {
  await page.goto('/login');

  // Email field is prefilled with the demo user (LoginView.vue:11-14 reactive form).
  const emailInput = page.getByLabel('Email');
  await expect(emailInput).toHaveValue('demo@doschei.local');

  // Password field is prefilled with password123 (LoginView.vue:11-14).
  const passwordInput = page.getByLabel('Password');
  await expect(passwordInput).toHaveValue('password123');

  // Sign in button (LoginView.vue:88-94).
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Auth guard redirects authenticated users to /groups.
  await page.waitForURL(/\/groups$/);
  await expect(page).toHaveURL(/\/groups$/);

  // GroupsView renders the page title via router meta.title 'Groups' (router/index.ts:32).
  await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
});
