/*
 * Config for the README screenshot generator (scripts/screenshots/).
 *
 * Deliberately SEPARATE from playwright.config.ts. CI runs
 * `npm run test:playwright -- <url>` (.github/workflows/tests.yaml), which is a
 * bare `npx playwright test` with no --grep and no --project filter, so
 * anything reachable from the main config runs on every CI job. These captures
 * are doc-asset generation, not assertions: a flaky shot must never fail the
 * test suite, and CI has no reason to render PNGs into a throwaway runner.
 *
 * Like the e2e config, this expects the app to already be running — pass the
 * host to `npm run screenshots`.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './scripts/screenshots',
  fullyParallel: false,
  // The three captures share one dataset and one page; they must not interleave.
  workers: 1,
  timeout: 120000,
  reporter: [['list']],
  use: {
    baseURL,
    // Pin the locale so the committed assets are English whatever the runner's
    // environment says. The in-app language comes from the user record, and a
    // freshly registered user defaults from the browser language.
    locale: 'en-US',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    // iPhone SE (3rd gen) metrics: 375x667. deviceScaleFactor is overridden to
    // 1 so each PNG is exactly 375x667 px. browserName pins chromium because
    // the descriptor's defaultBrowserType is webkit and only chromium is
    // installed here; the descriptor itself carries no browser binding, and the
    // frontend does no UA sniffing, so its Safari UA string is inert.
    ...devices['iPhone SE (3rd gen)'],
    deviceScaleFactor: 1,
    browserName: 'chromium',
  },
  projects: [
    {
      name: 'iphone-se',
      use: {
        launchOptions: {
          args: [`--unsafely-treat-insecure-origin-as-secure=${baseURL}`],
        },
      },
    },
  ],
});
