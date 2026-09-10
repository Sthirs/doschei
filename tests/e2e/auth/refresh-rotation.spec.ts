/**
 * Silent session renewal in a real browser (ADR-0023) — the AGENTS.md §4.2
 * happy-path proof for this feature.
 *
 * The access token lives an hour, so waiting for it to expire is not an option.
 * Instead each test invalidates the CLIENT's copy — removing it, or replacing it
 * with a non-JWT — which produces exactly the same 401 from `requireAuth` that a
 * genuine expiry does. No clock manipulation, no forged tokens, seconds not
 * minutes.
 *
 * Every test uses its OWN freshly registered user, never the shared
 * `authenticatedPage` fixture. With `workers: 2` two contexts would hold the
 * same demo refresh cookie, and a spec that rotates or revokes it would cascade
 * failures into unrelated specs.
 */
import { expect, test, registerUserViaApi } from '../fixtures/auth';

const TOKEN_KEY = 'doschei.auth.token';
const REFRESH_COOKIE = 'doschei.auth.refresh';
const REFRESH_URL = '/api/auth/session/refresh';

const refreshCookieValue = async (
  context: { cookies: () => Promise<Array<{ name: string; value: string }>> },
): Promise<string | undefined> =>
  (await context.cookies()).find((c) => c.name === REFRESH_COOKIE)?.value;

test.describe('refresh token rotation', () => {
  test('a signed-in user survives losing their access token', async ({ pageForUser }) => {
    const user = await registerUserViaApi(`refresh-reload-${Date.now()}@doschei.local`);
    const page = await pageForUser(user.email, user.password);

    await page.goto('/groups');
    await expect(page.getByRole('heading', { name: 'Do Schèi' })).toBeVisible();

    const cookieBefore = await refreshCookieValue(page.context());
    expect(cookieBefore, 'login must have set the refresh cookie').toBeTruthy();

    // Simulate an expired access token by dropping it. This is also the real
    // iOS-Safari storage-eviction case: the cookie is the only credential left.
    await page.evaluate((key) => localStorage.removeItem(key), TOKEN_KEY);
    await page.reload();

    // Still signed in — NOT bounced to /login.
    await expect(page).toHaveURL(/\/groups$/);
    await expect(page.getByRole('heading', { name: 'Do Schèi' })).toBeVisible();

    // A new access token was obtained…
    const restoredToken = await page.evaluate(
      (key) => localStorage.getItem(key),
      TOKEN_KEY,
    );
    expect(restoredToken).toBeTruthy();

    // …and the refresh cookie was rotated, which is the single-use property.
    const cookieAfter = await refreshCookieValue(page.context());
    expect(cookieAfter).toBeTruthy();
    expect(cookieAfter).not.toBe(cookieBefore);
  });

  test('a 401 mid-session is renewed and retried transparently', async ({ pageForUser }) => {
    const user = await registerUserViaApi(`refresh-retry-${Date.now()}@doschei.local`);
    const page = await pageForUser(user.email, user.password);

    await page.goto('/groups');
    await expect(page.getByRole('heading', { name: 'Do Schèi' })).toBeVisible();

    // A token requireAuth cannot verify — the same 401 an expired one produces.
    await page.evaluate((key) => {
      localStorage.setItem(key, 'not-a-jwt');
    }, TOKEN_KEY);

    const refreshed = page.waitForResponse(
      (response) =>
        response.url().includes(REFRESH_URL) && response.status() === 200,
      { timeout: 15_000 },
    );

    await page.goto('/account');
    await refreshed;

    // The view rendered, so the retried request succeeded.
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
    expect(token).not.toBe('not-a-jwt');
  });

  test('signing out revokes the refresh token server-side', async ({ pageForUser }) => {
    const user = await registerUserViaApi(`refresh-logout-${Date.now()}@doschei.local`);
    const page = await pageForUser(user.email, user.password);

    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    // Bare /login: a deliberate sign-out must not come back as
    // /login?redirect=…&error=expired, which is what happened while the router
    // guard still fired a speculative restore against the just-revoked cookie.
    await page.waitForURL(/\/login$/);

    expect(await refreshCookieValue(page.context())).toBeUndefined();

    // The assertion that distinguishes real revocation from a merely cleared
    // cookie: page.request shares the context cookie jar, so if the cookie were
    // only cleared client-side this would still be a 200.
    const response = await page.request.post(REFRESH_URL);
    expect(response.status()).toBe(401);
  });

  test('a visitor with no session is sent to /login after exactly one attempt', async ({ browser }) => {
    const context = await browser.newContext();

    // ADR-0020: a virgin localStorage has no `doschei.app.buildId`, so the boot
    // probe reads the first visit as a deploy and does its one-shot
    // purge-and-reload (lib/appVersion.ts). That extra document load legitimately
    // gets its own boot restore, which is not the refresh storm under test.
    // Seed the live build id — same trick as app-version.spec.ts:90 — so this
    // page loads exactly once. Nothing here weakens the assertions below.
    const { buildId } = (await (
      await context.request.get('/app-version.json')
    ).json()) as { buildId: string };
    const page = await context.newPage();
    await page.addInitScript(
      (id: string) => localStorage.setItem('doschei.app.buildId', id),
      buildId,
    );

    const attempts: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(REFRESH_URL)) attempts.push(request.url());
    });

    await page.goto('/groups');
    await page.waitForURL(/\/login/);

    await expect(page).toHaveURL(/redirect=%2Fgroups|redirect=\/groups/);
    // …and NOT told their session expired. The cold-boot restore is speculative,
    // so a visitor who never had a session must not be shown an expiry message.
    expect(page.url()).not.toContain('error=expired');
    // The boot restore is bounded to one attempt per page load — there is no
    // path to a refresh storm for a genuinely signed-out visitor.
    expect(attempts.length).toBeLessThanOrEqual(1);

    await context.close();
  });
});
