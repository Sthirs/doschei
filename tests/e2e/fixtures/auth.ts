/*
 * Demo creds seeded per seedService.ts:42; Alice/Bob/Carol share password123 per seedService.ts:18-22.
 * tests/e2e/.auth/ is git-ignored.
 *
 * authenticatedPage: test-scoped fixture that logs the demo user in via
 * POST /api/auth/login, persists a Playwright storageState to
 * tests/e2e/.auth/demo.json, and returns a Page with that storageState already
 * applied. Reuses the cached demo.json when present.
 *
 * pageForUser: test-scoped factory fixture. A test calls
 * `const page = await pageForUser(email, password)` to get a logged-in Page for
 * an arbitrary user. Each call logs in via the API, writes a fresh storageState
 * under tests/e2e/.auth/<sanitized-email>.json, and returns a new Page with that
 * storageState applied. All pages created by the factory are closed after the
 * test. Used by the 2-user invitation spec (invitations.spec.ts) so
 * browser contexts run inside the single-worker Playwright config (playwright.config.ts:7) or cross-worker in CI (2 workers).
 */
import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { test as base, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const AUTH_DIR = resolve('tests/e2e/.auth');
const DEMO_STORAGE_PATH = resolve(AUTH_DIR, 'demo.json');
const TOKEN_KEY = 'doschei.auth.token';

type LoginResponse = {
  token: string;
  user: { id: string; email: string; displayName: string };
};

/**
 * Shared inner helper: logs in via `POST /api/auth/login`, persists a Playwright
 * storageState file to `storagePath`, and returns `storagePath`. Reuses the
 * cached file when it already exists so repeated logins for the same user are a
 * no-op.
 */
async function loginAndCacheStorageState(
  email: string,
  password: string,
  storagePath: string,
): Promise<string> {
  if (existsSync(storagePath)) {
    return storagePath;
  }

  const response = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: expected status 200, got ${response.status}`);
  }

  const data = (await response.json()) as LoginResponse;

  if (typeof data.token !== 'string' || typeof data.user?.id !== 'string' || typeof data.user?.email !== 'string') {
    throw new Error(`Login response shape invalid for ${email}: ${JSON.stringify(data)}`);
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

  mkdirSync(dirname(storagePath), { recursive: true });
  const tmpPath = `${storagePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(storageState, null, 2), 'utf8');
  renameSync(tmpPath, storagePath);

  return storagePath;
}

/** Sanitize an email into a safe filename component (e.g. "a@b.co" → "a_b_co"). */
function sanitizeEmailForFilename(email: string): string {
  return email.replace(/[^a-zA-Z0-9._-]/g, '_');
}

type PageForUser = (email: string, password: string) => Promise<Page>;

export const test = base.extend<{ authenticatedPage: Page; pageForUser: PageForUser }>({
  authenticatedPage: async ({ browser }, use) => {
    const storageState = await loginAndCacheStorageState(
      'demo@doschei.local',
      'password123',
      DEMO_STORAGE_PATH,
    );
    const page = await browser.newPage({ storageState });
    await use(page);
    await page.close();
  },

  pageForUser: async ({ browser }, use) => {
    const createdPages: Page[] = [];
    const factory: PageForUser = async (email, password) => {
      const storagePath = resolve(AUTH_DIR, `${sanitizeEmailForFilename(email)}.json`);
      const storageState = await loginAndCacheStorageState(email, password, storagePath);
      const page = await browser.newPage({ storageState });
      createdPages.push(page);
      return page;
    };
    await use(factory);
    // Close every page the factory spun up so no context leaks across tests.
    await Promise.all(createdPages.map((page) => page.close().catch(() => undefined)));
  },
});

export { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// API-only registration helpers (no browser context needed).
// Used by invitations.spec.ts to create unique users before logging them in via
// the pageForUser fixture, and by acceptInvitationViaApi to log an invitee in.
// ---------------------------------------------------------------------------

export type RegisteredUser = {
  email: string;
  password: string;
  displayName: string;
  id: string;
  token: string;
};

/** Unique value helper mirroring apps/backend/tests/integration/helpers/api.ts:81. */
export function uniqueValue(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Register a user with an explicit email via `POST /api/auth/register` (201).
 * Returns the user's credentials, id, and token. Used by the deferred-attach
 * test where the email is invited BEFORE the user exists.
 */
export async function registerViaApi(
  email: string,
  password: string,
  displayName: string,
): Promise<RegisteredUser> {
  const response = await fetch(`${baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });

  if (response.status !== 201) {
    throw new Error(`registerViaApi: register failed for ${email} (status ${response.status})`);
  }

  const data = (await response.json()) as LoginResponse;
  return { email, password, displayName, id: data.user.id, token: data.token };
}

/**
 * Register a user with a unique generated email (reuse the uniqueValue pattern).
 * Convenience wrapper around registerViaApi for the common "fresh user" case.
 */
export async function registerUserViaApi(prefix: string): Promise<RegisteredUser> {
  const suffix = uniqueValue(prefix);
  return registerViaApi(`${suffix}@doschei.local`, 'password123', `User ${suffix}`);
}
