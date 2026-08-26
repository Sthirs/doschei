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
    test.setTimeout(90_000);

    test('buildId change triggers exactly one reload, clears stale cache, preserves auth', async ({
      authenticatedPage: page,
    }) => {
      // Seed the prior build so the first load does not itself reload (a
      // first-time visitor hits the null→A path). Guarded so it is not
      // re-applied after the app's own reload during the test.
      await page.addInitScript(
        "const __k='doschei.e2e.loads'; localStorage.setItem(__k, String((Number(localStorage.getItem(__k) ?? '0')) + 1)); if (localStorage.getItem('doschei.app.buildId') === null) { localStorage.setItem('doschei.app.buildId', 'e2e-build-A'); }",
      );

      // A single route handler driven by a mutable build id. Re-registering
      // page.route does NOT override the first handler in Playwright, so a
      // mutable variable is required to change the served build.
      let currentBuildId = 'e2e-build-A';
      await page.route('**/app-version.json', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: '9.9.9-test', buildId: currentBuildId }),
        });
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const loadsBefore = await page.evaluate(() =>
        Number(localStorage.getItem('doschei.e2e.loads') ?? '0'),
      );

      // Cache Storage only exists in secure contexts; over plain HTTP dev
      // deployments caches is undefined and the production purge is a no-op
      // there too, so guard every caches access.
      const capturedToken = await page.evaluate(async () => {
        if (typeof caches !== 'undefined') {
          const cache = await caches.open('doschei-e2e-stale-marker');
          await cache.put('/__marker', new Response('x'));
        }
        return localStorage.getItem('doschei.auth.token');
      });
      expect(capturedToken).toBeTruthy();

      currentBuildId = 'e2e-build-B';

      // The probe is throttled to one check per 30s and the boot probe already
      // ran on load, so wait past the window before foregrounding the tab.
      await page.waitForTimeout(31_000);

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect.poll(
        async () => {
          try {
            return await page.evaluate(
              () => localStorage.getItem('doschei.app.buildId'),
            );
          } catch {
            // The reload navigation can destroy the execution context mid-poll;
            // return null so the poll retries against the reloaded page.
            return null;
          }
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      ).toBe('e2e-build-B');

      const loadCount = await page.evaluate(() =>
        Number(localStorage.getItem('doschei.e2e.loads') ?? '0'),
      );
      expect(loadCount).toBe(loadsBefore + 1);

      const cachesAvailable = await page.evaluate(() => typeof caches !== 'undefined');
      if (cachesAvailable) {
        const markerCacheExists = await page.evaluate(async () =>
          caches.has('doschei-e2e-stale-marker'),
        );
        expect(markerCacheExists).toBe(false);
      }

      const currentToken = await page.evaluate(() => localStorage.getItem('doschei.auth.token'));
      expect(currentToken).toBe(capturedToken);

      const groupsResponse = await page.context().request.get(`${baseURL}/groups`);
      expect(groupsResponse.status()).toBe(200);

      const sessionGuard = await page.evaluate(() => sessionStorage.getItem('doschei.app.reloadGuard'));
      expect(sessionGuard).toBeNull();
    });
  });
});
