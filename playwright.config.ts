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
      use: { ...devices['Desktop Chrome'] },
      launchOptions: {
        args: [`--unsafely-treat-insecure-origin-as-secure=${baseURL}`],
      },
    },
  ],
});
