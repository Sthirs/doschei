// No webServer: the deployed app must already be reachable at PLAYWRIGHT_BASE_URL (same model as apps/backend/scripts/test-integration.sh).
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 2, // always 2 so local runs surface parallel-conflict flakes the same way CI does
  timeout: 120000,
  retries: process.env.CI ? 0 : 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Playwright's default headless Chromium binary (headless_shell)
        // does not honor --unsafely-treat-insecure-origin-as-secure below,
        // so the plain-HTTP ingress never becomes a secure context and
        // navigator.serviceWorker / Notification stay unavailable. The full
        // 'chromium' channel binary does honor it.
        channel: 'chromium',
        // launchOptions belongs inside `use` — a sibling `launchOptions` key
        // on the project object (the previous shape here) is silently
        // ignored by Playwright, so this flag was never actually applied.
        launchOptions: {
          args: [`--unsafely-treat-insecure-origin-as-secure=${baseURL}`],
        },
      },
    },
  ],
});
