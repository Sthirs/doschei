import { test, expect } from './fixtures/auth';
import { AccountPage } from './pages/AccountPage';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

test.describe('App version and cache behavior', () => {
  // Spec A: Cache headers (no auth needed)
  test.describe('Cache headers', () => {
    test('/app-version.json returns 200 with correct shape and no-store', async ({ request }) => {
      const response = await request.get(`${baseURL}/app-version.json`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toEqual(
        expect.objectContaining({
          version: expect.any(String),
          buildId: expect.any(String),
        }),
      );

      const cacheControl = response.headers()['cache-control'] ?? '';
      expect(cacheControl).toContain('no-store');
    });

    test('/ returns no-store', async ({ request }) => {
      const response = await request.get(`${baseURL}/`);
      expect(response.status()).toBe(200);

      const cacheControl = response.headers()['cache-control'] ?? '';
      expect(cacheControl).toContain('no-store');
    });

    test('assets/* returns immutable + max-age=31536000', async ({ request }) => {
      // First fetch / to extract an asset href
      const indexResponse = await request.get(`${baseURL}/`);
      expect(indexResponse.status()).toBe(200);
      const html = await indexResponse.text();

      // Extract first assets/<file> href from the HTML
      const assetMatch = html.match(/assets\/[^"'>\s]+/);
      expect(assetMatch).not.toBeNull();

      const assetPath = assetMatch![0];
      const assetResponse = await request.get(`${baseURL}/${assetPath}`);
      expect(assetResponse.status()).toBe(200);

      const cacheControl = assetResponse.headers()['cache-control'] ?? '';
      expect(cacheControl).toContain('immutable');
      expect(cacheControl).toContain('max-age=31536000');
    });

    test('/sw.js returns no-cache', async ({ request }) => {
      const response = await request.get(`${baseURL}/sw.js`);
      expect(response.status()).toBe(200);

      const cacheControl = response.headers()['cache-control'] ?? '';
      expect(cacheControl).toContain('no-cache');
    });
  });

  // Spec B: Account version cross-check
  test.describe('Account version cross-check', () => {
    test('AccountPage.versionLine contains the version from /app-version.json', async ({
      authenticatedPage: page,
    }) => {
      const account = new AccountPage(page);

      // Read the nginx-served version via context().request (not page.request)
      const versionResponse = await page.context().request.get(`${baseURL}/app-version.json`);
      expect(versionResponse.status()).toBe(200);
      const versionData = await versionResponse.json();
      const expectedVersion = versionData.version;

      await page.goto('/account');
      await expect(account.versionLine).toBeVisible();
      await expect(account.versionLine).toContainText(expectedVersion);
    });
  });

  // Spec C: Redeploy simulation / cache invalidation
  test.describe('Redeploy simulation / cache invalidation', () => {
    test.setTimeout(60_000);

    test('buildId change triggers exactly one reload, clears stale cache, preserves auth', async ({
      authenticatedPage: page,
    }) => {
      // STRICT ORDER: addInitScript FIRST (runs before EVERY page load)
      await page.addInitScript('window.__loads = (window.__loads ?? 0) + 1');

      // THEN route interception for initial version
      await page.route('**/app-version.json', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: '9.9.9-test', buildId: 'e2e-build-A' }),
        });
      });

      // THEN goto
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Seed marker cache and capture token
      const capturedToken = await page.evaluate(async () => {
        const cache = await caches.open('doschei-e2e-stale-marker');
        await cache.put('/__marker', new Response('x'));
        return localStorage.getItem('doschei.auth.token');
      });
      expect(capturedToken).toBeTruthy();

      // Re-route the endpoint to new buildId
      await page.route('**/app-version.json', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: '9.9.9-test', buildId: 'e2e-build-B' }),
        });
      });

      // Override visibilityState and dispatch visibilitychange
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Wait for load and poll until buildId matches
      await page.waitForLoadState('load');
      await expect.poll(
        async () => {
          return await page.evaluate(() => localStorage.getItem('doschei.app.buildId'));
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      ).toBe('e2e-build-B');

      // Assertions
      // 1. window.__loads === 2 (initial + EXACTLY ONE reload)
      const loadCount = await page.evaluate(() => window.__loads);
      expect(loadCount).toBe(2);

      // 2. caches.has('doschei-e2e-stale-marker') === false (invalidation proof)
      const markerCacheExists = await page.evaluate(async () => {
        return await caches.has('doschei-e2e-stale-marker');
      });
      expect(markerCacheExists).toBe(false);

      // 3. captured token === current token AND authenticated UI still accessible
      const currentToken = await page.evaluate(() => localStorage.getItem('doschei.auth.token'));
      expect(currentToken).toBe(capturedToken);

      // Verify /groups is reachable (no login redirect)
      const groupsResponse = await page.context().request.get(`${baseURL}/groups`);
      expect(groupsResponse.status()).toBe(200);

      // 4. sessionStorage guard key absent after settle
      const sessionGuard = await page.evaluate(() => sessionStorage.getItem('doschei.app.reloadGuard'));
      expect(sessionGuard).toBeNull();
    });
  });
});
