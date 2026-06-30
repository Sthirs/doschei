/*
 * Demo creds seeded per seedService.ts:42; Alice/Bob/Carol share password123 per seedService.ts:18-22.
 * tests/e2e/.auth/ is git-ignored.
 *
 * authenticatedPage: worker-scoped fixture that logs in via POST /api/auth/login,
 * persists a Playwright storageState to tests/e2e/.auth/demo.json, and returns a
 * Page with that storageState already applied. Subsequent workers reuse the
 * cached demo.json without re-fetching.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { test as base, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const storageStatePath = resolve('tests/e2e/.auth/demo.json');
const TOKEN_KEY = 'doschei.auth.token';

type LoginResponse = {
  token: string;
  user: { id: string; email: string };
};

/**
 * Ensure the .auth directory exists and return a valid storageState for the
 * demo user. Reuses the cached demo.json when present; otherwise performs a
 * fresh login and writes the file.
 */
async function getStorageState(): Promise<string> {
  if (existsSync(storageStatePath)) {
    return storageStatePath;
  }

  const response = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@doschei.local', password: 'password123' }),
  });

  if (response.status !== 200) {
    throw new Error(`Login failed: expected status 200, got ${response.status}`);
  }

  const data = (await response.json()) as LoginResponse;

  if (typeof data.token !== 'string' || typeof data.user?.id !== 'string' || typeof data.user?.email !== 'string') {
    throw new Error(`Login response shape invalid: ${JSON.stringify(data)}`);
  }

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseURL,
        localStorage: [{ name: TOKEN_KEY, value: data.token }],
      },
    ],
  };

  mkdirSync(dirname(storageStatePath), { recursive: true });
  writeFileSync(storageStatePath, JSON.stringify(storageState, null, 2), 'utf8');

  return storageStatePath;
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser }, use) => {
    const storageState = await getStorageState();
    const page = await browser.newPage({ storageState });
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
