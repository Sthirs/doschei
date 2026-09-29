// The unhappy path of local sign-in: wrong credentials keep the visitor on
// /login with an explanation, and a correct retry still works. Every other
// auth spec only exercises successful sign-in.
import { expect, seedBuildId, test } from '../fixtures/auth';
import { LoginPage } from '../pages';

test('wrong password shows an error and keeps the visitor on /login; a correct retry signs in', async ({ page }) => {
  const config = await (await page.request.get('/api/auth/oauth/config')).json().catch(() => null);
  test.skip(config?.enabled === true && config?.autoLaunch === true, 'OAuth autoLaunch is enabled — login UI not visible');

  // A bare `page` has no stored build id, so the app would fire its one-time
  // purge-and-reload (ADR-0020) mid-flow and reload /login under the retry
  // (see seedBuildId's doc comment in ../fixtures/auth).
  await seedBuildId(page);

  const loginPage = new LoginPage(page);
  await page.goto('/login');

  const loginResponse = page.waitForResponse((res) => res.url().endsWith('/api/auth/login'));
  await loginPage.login('demo@doschei.local', 'not-the-password');
  expect((await loginResponse).status()).toBe(401);

  await expect(page.getByText('We could not log you in with those credentials.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem('doschei.auth.token'))).toBeNull();

  await loginPage.login('demo@doschei.local', 'password123');
  await loginPage.expectRedirectedToGroups();
});
