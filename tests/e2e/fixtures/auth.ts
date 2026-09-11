/*
 * Demo creds seeded per seedService.ts:42; Alice/Bob/Carol share password123 per seedService.ts:18-22.
 * tests/e2e/.auth/ is git-ignored.
 *
 * authenticatedPage: test-scoped fixture that logs the demo user in via
 * POST /api/auth/login, persists a Playwright storageState to
 * tests/e2e/.auth/demo-<workerIndex>.json, and returns a Page with that
 * storageState already applied. Reuses the cached file only while it is still
 * usable (see isStorageStateUsable).
 *
 * pageForUser: test-scoped factory fixture. A test calls
 * `const page = await pageForUser(email, password)` to get a logged-in Page for
 * an arbitrary user. Each call logs in via the API, writes a fresh storageState
 * under tests/e2e/.auth/<sanitized-email>-<workerIndex>.json, and returns a new
 * Page with that storageState applied. All pages created by the factory are
 * closed after the test. Used by the 2-user invitation spec (invitations.spec.ts)
 * so browser contexts run inside the single-worker Playwright config
 * (playwright.config.ts:7) or cross-worker in CI (2 workers).
 *
 * ADR-0023 made three things load-bearing here:
 *
 *  1. The refresh cookie MUST be captured into the storageState. Without it a
 *     stored access token that has aged past ACCESS_TOKEN_TTL_SECONDS has no way
 *     to renew, and every spec fails at the auth guard.
 *  2. A cached file MUST be validated rather than trusted. The old code returned
 *     early on existsSync alone, so a file written before the access token was
 *     shortened — or simply written an hour ago during a long run — silently
 *     produced an expired session.
 *  3. Storage state MUST be per worker. Two workers sharing one file hold the
 *     SAME refresh cookie; when both refresh it, the loser trips reuse detection
 *     and the family is revoked for both.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { test as base, type Browser, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const AUTH_DIR = resolve('tests/e2e/.auth');
const TOKEN_KEY = 'doschei.auth.token';
const REFRESH_COOKIE_NAME = 'doschei.auth.refresh';
/** Refuse a cached access token with less than this much life left. */
const MIN_TOKEN_LIFETIME_SECONDS = 60;

type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
};

/**
 * Turn the backend's `Set-Cookie` into Playwright's storageState cookie shape.
 *
 * Path, Max-Age and SameSite are parsed out of the real header rather than
 * hardcoded, so a future flag change cannot silently produce a cookie the
 * browser then rejects.
 */
function parseRefreshCookie(setCookie: string[]): StoredCookie {
  const header = setCookie.find((line) =>
    line.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );

  // A missing refresh cookie is a real backend regression (ADR-0023 issues one
  // on every login). Failing loudly here beats a confusing auth-guard failure
  // an hour into the run.
  if (!header) {
    throw new Error(
      `Login did not set the ${REFRESH_COOKIE_NAME} cookie. Set-Cookie was: ${JSON.stringify(setCookie)}`,
    );
  }

  const [pair, ...attributes] = header.split(';').map((part) => part.trim());
  const value = pair.slice(`${REFRESH_COOKIE_NAME}=`.length);

  const attribute = (name: string): string | undefined => {
    const match = attributes.find(
      (attr) => attr.toLowerCase().startsWith(`${name.toLowerCase()}=`),
    );
    return match?.slice(name.length + 1);
  };
  const hasFlag = (name: string): boolean =>
    attributes.some((attr) => attr.toLowerCase() === name.toLowerCase());

  const maxAge = Number(attribute('Max-Age') ?? '0');
  const sameSite = (attribute('SameSite') ?? 'Lax') as StoredCookie['sameSite'];

  return {
    name: REFRESH_COOKIE_NAME,
    value,
    // Host-only cookie: no leading dot.
    domain: new URL(baseURL).hostname,
    path: attribute('Path') ?? '/',
    expires: Math.floor(Date.now() / 1000) + (maxAge || 3600),
    httpOnly: hasFlag('HttpOnly'),
    secure: hasFlag('Secure'),
    sameSite,
  };
}

/** Seconds of life left on a JWT, or null when it cannot be read. */
function tokenSecondsRemaining(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    if (typeof exp !== 'number') return null;
    return exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

/**
 * A cached storageState is reusable only if BOTH credentials still work: an
 * access token with real life left, and an unexpired refresh cookie to renew it
 * with. Anything else falls through to a fresh login, which also means every
 * pre-ADR-0023 file (they have no cookies) invalidates itself automatically.
 */
function isStorageStateUsable(path: string): boolean {
  if (!existsSync(path)) return false;

  try {
    const state = JSON.parse(readFileSync(path, 'utf8')) as {
      cookies?: StoredCookie[];
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
    };

    const token = state.origins
      ?.flatMap((origin) => origin.localStorage ?? [])
      .find((entry) => entry.name === TOKEN_KEY)?.value;
    if (!token) return false;

    const remaining = tokenSecondsRemaining(token);
    if (remaining === null || remaining < MIN_TOKEN_LIFETIME_SECONDS) return false;

    const cookie = state.cookies?.find((c) => c.name === REFRESH_COOKIE_NAME);
    return Boolean(cookie && cookie.expires > Date.now() / 1000);
  } catch {
    return false;
  }
}

type LoginResponse = {
  token: string;
  user: { id: string; email: string; displayName: string };
};

/**
 * A brand-new page has no `doschei.app.buildId` in localStorage. main.ts's
 * ADR-0020 "new build detected" check treats that as a mismatch on its very
 * first navigation, unregisters the service worker it just installed, and
 * force-reloads mid-test. This was invisible as long as the Playwright
 * config never actually gave pages a secure context (see
 * playwright.config.ts's `channel`/`launchOptions` history) — without one,
 * no service worker ever installed at all, so this path never ran. Seeding
 * the current build id before the first navigation (real first-time
 * visitors get this same one-time reload; it is orthogonal to whatever a
 * given spec is testing) makes every page skip it.
 */
async function currentBuildId(): Promise<string> {
  const res = await fetch(`${baseURL}/app-version.json`);
  const { buildId } = (await res.json()) as { buildId: string };
  return buildId;
}

async function seedBuildId(page: Page): Promise<void> {
  const buildId = await currentBuildId();
  await page.addInitScript((id: string) => {
    window.localStorage.setItem('doschei.app.buildId', id);
  }, buildId);
}

/**
 * Shared inner helper: logs in via `POST /api/auth/login`, persists a Playwright
 * storageState file to `storagePath`, and returns `storagePath`. Reuses the
 * cached file only while `isStorageStateUsable` says both credentials in it are
 * still good, so repeated logins for the same user are a no-op but a stale file
 * is replaced rather than handed back.
 */
async function loginAndCacheStorageState(
  email: string,
  password: string,
  storagePath: string,
): Promise<string> {
  if (isStorageStateUsable(storagePath)) {
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
    // ADR-0023: carry the refresh cookie, or the browser has no way to renew an
    // access token that ages out mid-run.
    cookies: [parseRefreshCookie(response.headers.getSetCookie())],
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

async function createAuthenticatedPage(
  browser: Browser,
  testInfo: { parallelIndex: number },
): Promise<Page> {
  const storageState = await loginAndCacheStorageState(
    'demo@doschei.local',
    'password123',
    // Per worker: two workers sharing one file would hold the same refresh
    // cookie, and the loser of a concurrent rotation trips reuse detection.
    // Concurrent families for one user are perfectly legal server-side.
    resolve(AUTH_DIR, `demo-${testInfo.parallelIndex}.json`),
  );
  return browser.newPage({ storageState });
}

type PageForUser = (email: string, password: string) => Promise<Page>;

export const test = base.extend<{
  authenticatedPage: Page;
  pageForUser: PageForUser;
  /**
   * Same login as `authenticatedPage`, minus the `seedBuildId` call. Exists
   * only for app-version.spec.ts's own redeploy-simulation test, which
   * drives `doschei.app.buildId` and `/app-version.json` itself to assert
   * ADR-0020's reload behaviour — seeding a real build id ahead of it would
   * make every navigation in that test see a mismatch against its mocked
   * `/app-version.json` response, not just the one it means to simulate.
   */
  authenticatedPageNoBuildIdSeed: Page;
}>({
  authenticatedPage: async ({ browser }, use, testInfo) => {
    const page = await createAuthenticatedPage(browser, testInfo);
    await seedBuildId(page);
    await use(page);
    await page.close();
  },

  authenticatedPageNoBuildIdSeed: async ({ browser }, use, testInfo) => {
    const page = await createAuthenticatedPage(browser, testInfo);
    await use(page);
    await page.close();
  },

  pageForUser: async ({ browser }, use, testInfo) => {
    const createdPages: Page[] = [];
    const factory: PageForUser = async (email, password) => {
      const storagePath = resolve(
        AUTH_DIR,
        `${sanitizeEmailForFilename(email)}-${testInfo.parallelIndex}.json`,
      );
      const storageState = await loginAndCacheStorageState(email, password, storagePath);
      const page = await browser.newPage({ storageState });
      await seedBuildId(page);
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
