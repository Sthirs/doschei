/**
 * ADR-0030 — client-side group data cache (in-memory, stale-while-revalidate).
 *
 * The happy path the ADR exists for is test 1: open a group, add an expense,
 * come back, and the group is on screen at once (no "Loading…"), with the new
 * expense appearing when the background refetch lands.
 *
 * Technique: `delayGets` holds matching GETs for a while, so "rendered from
 * cache" and "rendered from the network" are distinguishable by time. The
 * `installLoadingProbe` init script records whether "Loading" EVER appeared,
 * which catches a one-frame flash that `not.toBeVisible()` would miss.
 *
 * Every test builds its own users and groups over the API (fixtures/groups),
 * so nothing here touches the shared demo user and it stays safe with
 * `workers: 2`.
 */
import type { Page, Request } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { createGroupViaApi, fetchBalanceViaApi, registerNamedUser } from '../fixtures/groups';
import type { RegisteredUser } from '../fixtures/auth';
import { AccountPage, GroupDetailPage, GroupsPage, LoginPage } from '../pages';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const TOKEN_KEY = 'doschei.auth.token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiAs<T = unknown>(
  user: RegisteredUser,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${baseURL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${await response.text()}`);
  }
  return (response.status === 204 ? {} : await response.json()) as T;
}

async function addExpenseViaApi(
  payer: RegisteredUser,
  groupId: string,
  splitWith: RegisteredUser[],
  description: string,
  amount: number,
): Promise<string> {
  const { expense } = await apiAs<{ expense: { id: string } }>(payer, 'POST', `/groups/${groupId}/expenses`, {
    description,
    amount,
    paidByUserId: payer.id,
    splits: splitWith.map((u) => ({ userId: u.id, shareType: 'EQUAL', shareValue: 0 })),
  });
  return expense.id;
}

async function addSettlementViaApi(
  payer: RegisteredUser,
  payee: RegisteredUser,
  groupId: string,
  amount: number,
): Promise<void> {
  await apiAs(payer, 'POST', `/groups/${groupId}/settlements`, {
    paidByUserId: payer.id,
    paidToUserId: payee.id,
    amount,
  });
}

const isDetailGet = (groupId?: string) => (request: Request) =>
  request.method() === 'GET' &&
  new RegExp(`/api/groups/${groupId ?? '[^/?]+'}(\\?.*)?$`).test(request.url());

/** Count requests matching `predicate` from now on. */
function countRequests(page: Page, predicate: (r: Request) => boolean) {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (predicate(r)) seen.push(r.url());
  });
  return seen;
}

/**
 * Hold every GET on `pattern` for `ms` before letting it through. Returns an
 * `off()` to remove the delay.
 */
async function delayGets(page: Page, pattern: RegExp, ms: number) {
  const handler = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.fallback().catch(() => undefined);
  };
  await page.route(pattern, handler);
  return { off: () => page.unroute(pattern, handler) };
}

/** Make every GET on `pattern` hang forever (until unrouted / page closes). */
async function hangGets(page: Page, pattern: RegExp) {
  const handler = (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return new Promise<void>(() => {});
  };
  await page.route(pattern, handler);
  return { off: () => page.unroute(pattern, handler) };
}

async function failGets(page: Page, pattern: RegExp, status: number) {
  const handler = (route: import('@playwright/test').Route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status, contentType: 'application/json', body: '{"message":"boom"}' })
      : route.fallback();
  await page.route(pattern, handler);
  return { off: () => page.unroute(pattern, handler) };
}

const detailUrl = (groupId: string) => new RegExp(`/api/groups/${groupId}(\\?.*)?$`);
const listUrl = /\/api\/groups(\?.*)?$/;

/**
 * Records whether any "Loading" text (Loading…, Loading group..., Loading
 * settings...) was ever rendered. Survives client-side navigation; a full
 * reload re-installs it (and starts from `false`).
 */
async function installLoadingProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sawLoading: boolean; __watchText?: string; __sawWatchText: boolean };
    w.__sawLoading = false;
    w.__sawWatchText = false;
    const check = () => {
      const text = document.body?.innerText ?? '';
      if (/Loading|Caricamento/.test(text)) w.__sawLoading = true;
      if (w.__watchText && text.includes(w.__watchText)) w.__sawWatchText = true;
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

const resetLoadingProbe = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __sawLoading: boolean }).__sawLoading = false;
  });

const sawLoading = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sawLoading: boolean }).__sawLoading);

/** Also record whether `text` is ever rendered (e.g. another user's group name). */
const watchForText = (page: Page, text: string) =>
  page.evaluate((t) => {
    const w = window as unknown as { __watchText?: string; __sawWatchText: boolean };
    w.__watchText = t;
    w.__sawWatchText = false;
  }, text);

const sawWatchedText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sawWatchText: boolean }).__sawWatchText);

/** Simulate the app going to the background and coming back (focus refresh). */
async function hideAndShow(page: Page) {
  await page.evaluate(() => {
    const set = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set('hidden');
    set('visible');
  });
}

const balanceCard = (page: Page) => page.locator('.balance-card');
const expenseRow = (page: Page, text: string) =>
  page.getByTestId('expense-row').filter({ hasText: text });

/** A fresh two-member group, the owner signed in on `page`, the group open. */
async function openFreshGroup(
  pageForUser: (email: string, password: string) => Promise<Page>,
  opts: { prefix?: string; seedExpense?: string } = {},
) {
  const owner = await registerNamedUser('Ann');
  const bob = await registerNamedUser('Bob');
  const group = await createGroupViaApi(owner, [bob], opts.prefix ?? 'e2e-cache');
  if (opts.seedExpense) await addExpenseViaApi(owner, group.id, [owner, bob], opts.seedExpense, 10);

  const page = await pageForUser(owner.email, owner.password);
  await installLoadingProbe(page);
  await page.goto('/groups');
  await new GroupsPage(page).openGroup(group.name);
  await expect(balanceCard(page)).toBeVisible();
  return { page, owner, bob, group, detail: new GroupDetailPage(page) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('group data cache (ADR-0030)', () => {
  test('add-expense round trip: the group stays on screen and the new expense lands after the refetch', async ({
    pageForUser,
  }) => {
    const { page, owner, bob, group, detail } = await openFreshGroup(pageForUser, {
      seedExpense: 'Breakfast',
    });
    await expect(expenseRow(page, 'Breakfast')).toBeVisible();

    await detail.clickAddExpense();
    await detail.fillDescription('Pizza');
    await detail.fillAmount('30');
    await detail.setEqualSplit();
    await detail.selectSplitMember(owner.displayName);
    await detail.selectSplitMember(bob.displayName);

    // The refetch after saving takes 2 s; the cached group must not wait for it.
    const delayed = await delayGets(page, detailUrl(group.id), 2000);
    await resetLoadingProbe(page);
    await detail.saveExpense();

    await expect(balanceCard(page)).toBeVisible({ timeout: 1000 });
    await expect(expenseRow(page, 'Breakfast')).toBeVisible({ timeout: 1000 });
    await detail.expectExpenseRowVisible({
      description: 'Pizza',
      amount: '30',
      paidByName: owner.displayName.split(' ')[0],
    });
    expect(await sawLoading(page)).toBe(false);
    await delayed.off();

    // Balances are the server's (ADR-0006), never computed on the client.
    const balance = await fetchBalanceViaApi(owner, group.id);
    await expect(balanceCard(page)).toContainText(
      `€${Math.abs(balance.netForCurrentUser).toFixed(2)}`,
    );
  });

  test('back to the groups list renders the cached list at once', async ({ pageForUser }) => {
    const { page, group, detail } = await openFreshGroup(pageForUser);

    await delayGets(page, listUrl, 2000);
    await resetLoadingProbe(page);
    await detail.clickBackToGroups();

    await expect(page.getByRole('heading', { name: group.name, level: 2 })).toBeVisible({ timeout: 1000 });
    expect(await sawLoading(page)).toBe(false);
  });

  test('prefetch warms the first three groups, so opening the first one is instant', async ({ pageForUser }) => {
    const owner = await registerNamedUser('Ann');
    const groups = [];
    for (let i = 0; i < 4; i += 1) groups.push(await createGroupViaApi(owner, [], `e2e-prefetch-${i}`));
    const page = await pageForUser(owner.email, owner.password);
    await installLoadingProbe(page);
    const detailGets = countRequests(page, isDetailGet());

    const prefetched = Promise.all(
      [0, 1, 2].map(() => page.waitForResponse((r) => isDetailGet()(r.request()))),
    );
    await page.goto('/groups');
    await prefetched;
    await page.waitForTimeout(500); // would catch a 4th prefetch

    expect(detailGets).toHaveLength(3);
    const ids = groups.map((g) => g.id);
    for (const url of detailGets) {
      expect(ids.some((id) => url.endsWith(`/api/groups/${id}`))).toBe(true);
    }

    // The first row is one of the prefetched groups: it opens from cache.
    const firstHeading = page.getByRole('heading', { level: 2 }).first();
    const firstName = (await firstHeading.textContent())!.trim();
    const first = groups.find((g) => g.name === firstName)!;
    expect(detailGets.some((url) => url.endsWith(`/api/groups/${first.id}`))).toBe(true);

    await delayGets(page, detailUrl(first.id), 2000);
    await resetLoadingProbe(page);
    await new GroupsPage(page).openGroup(first.name);
    await expect(balanceCard(page)).toBeVisible({ timeout: 1000 });
    expect(await sawLoading(page)).toBe(false);
  });

  test('expense and settle-up forms open from the cache with no network', async ({ pageForUser }) => {
    const { page, group, detail } = await openFreshGroup(pageForUser);
    const hung = await hangGets(page, detailUrl(group.id));

    await detail.clickAddExpense();
    await expect(page.getByTestId('paid-by-section').getByRole('button', { name: /Ann/ })).toBeVisible({
      timeout: 2000,
    });
    await expect(page.getByTestId('split-with-section').getByRole('button', { name: /Bob/ })).toBeVisible();

    await detail.clickBackToGroup();
    await expect(balanceCard(page)).toBeVisible({ timeout: 1000 });

    await detail.clickSettleUp();
    await expect(page.getByTestId('payer-picker')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId('payer-picker')).not.toHaveText(/Select\.\.\./);
    await hung.off();
  });

  test('a cold deep link to the expense form still loads (one GET)', async ({ pageForUser }) => {
    const owner = await registerNamedUser('Ann');
    const bob = await registerNamedUser('Bob');
    const group = await createGroupViaApi(owner, [bob], 'e2e-deeplink');
    const page = await pageForUser(owner.email, owner.password);
    const gets = countRequests(page, isDetailGet(group.id));

    await page.goto(`/groups/${group.id}/expenses/new`);

    await expect(page.getByTestId('paid-by-section').getByRole('button', { name: /Bob/ })).toBeVisible();
    expect(gets).toHaveLength(1);
  });

  test('editing and deleting an expense or a settlement refreshes the group', async ({ pageForUser }) => {
    const { page, owner, bob, group, detail } = await openFreshGroup(pageForUser);
    await addExpenseViaApi(owner, group.id, [owner, bob], 'Taxi', 20);
    await addSettlementViaApi(bob, owner, group.id, 5);
    await hideAndShow(page); // pick up the API-made entries
    await expect(expenseRow(page, 'Taxi')).toBeVisible();

    // Edit the expense amount.
    await expenseRow(page, 'Taxi').click();
    await page.waitForURL(/\/expenses\/[^/]+\/edit$/);
    await detail.fillAmount('44');
    await detail.saveExpense();
    await expect(expenseRow(page, 'Taxi').getByText('€44.00')).toBeVisible();

    // Delete it.
    await expenseRow(page, 'Taxi').click();
    await page.waitForURL(/\/expenses\/[^/]+\/edit$/);
    await detail.deleteCurrentExpense();
    await expect(expenseRow(page, 'Taxi')).toHaveCount(0);

    // Edit the settlement amount.
    await detail.clickSettlementRow();
    await page.waitForURL(/\/settlements\/[^/]+\/edit$/);
    await detail.setSettleUpAmount('7');
    await detail.saveSettleUp();
    await expect(expenseRow(page, 'Settlement').getByText('€7.00')).toBeVisible();

    // Delete it.
    await detail.clickSettlementRow();
    await page.waitForURL(/\/settlements\/[^/]+\/edit$/);
    await detail.deleteCurrentSettlement();
    await expect(page.getByTestId('expense-row')).toHaveCount(0);
    await detail.expectNoExpenses();
  });

  test("another member's change shows when the app comes back to the foreground", async ({ pageForUser }) => {
    const { page, owner, bob, group } = await openFreshGroup(pageForUser);
    await resetLoadingProbe(page);

    await addExpenseViaApi(bob, group.id, [owner, bob], 'Bob paid ferry', 18);
    await hideAndShow(page);

    await expect(expenseRow(page, 'Bob paid ferry')).toBeVisible();
    expect(await sawLoading(page)).toBe(false);
  });

  test('a push message for the group refreshes the open group page', async ({ pageForUser }) => {
    const { page, owner, bob, group } = await openFreshGroup(pageForUser);
    test.skip(
      !(await page.evaluate(() => 'serviceWorker' in navigator)),
      'navigator.serviceWorker unavailable (insecure origin)',
    );
    await resetLoadingProbe(page);

    await addExpenseViaApi(bob, group.id, [owner, bob], 'Bob paid museum', 24);
    // Exactly what sw.ts posts to window clients on `push` (lib/groupDataLifecycle.ts).
    await page.evaluate((url) => {
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent('message', { data: { type: 'push', url } }),
      );
    }, `/groups/${group.id}`);

    await expect(expenseRow(page, 'Bob paid museum')).toBeVisible();
    expect(await sawLoading(page)).toBe(false);
  });

  test('a failed refresh keeps the cached group and shows a non-blocking notice', async ({ pageForUser }) => {
    const { page, group } = await openFreshGroup(pageForUser, { seedExpense: 'Lunch' });

    const failing = await failGets(page, detailUrl(group.id), 500);
    await hideAndShow(page);

    const notice = page.getByText('Could not refresh. Showing the last loaded data.');
    await expect(notice).toBeVisible();
    await expect(expenseRow(page, 'Lunch')).toBeVisible();
    await expect(balanceCard(page)).toBeVisible();
    await expect(page.getByText('We could not load this group.')).toHaveCount(0);

    await failing.off();
    await hideAndShow(page);
    await expect(notice).toHaveCount(0);
  });

  test('a group you were removed from switches to the full-screen error on refresh', async ({ pageForUser }) => {
    const owner = await registerNamedUser('Ann');
    const bob = await registerNamedUser('Bob');
    const group = await createGroupViaApi(owner, [bob], 'e2e-removed');
    const page = await pageForUser(bob.email, bob.password);
    await page.goto('/groups');
    await new GroupsPage(page).openGroup(group.name);
    await expect(balanceCard(page)).toBeVisible();

    await apiAs(owner, 'DELETE', `/groups/${group.id}/members/${bob.id}`);
    await hideAndShow(page);

    await expect(page.getByText('We could not load this group.')).toBeVisible();
    await expect(balanceCard(page)).toHaveCount(0);
  });

  test("logout clears the cache: the next user never sees the previous user's groups", async ({ pageForUser }) => {
    const { page, group } = await openFreshGroup(pageForUser);
    const other = await registerNamedUser('Cleo');
    await createGroupViaApi(other, [], 'e2e-other-user');

    // Sign out through the UI (topbar avatar → account → Sign out).
    await new AccountPage(page).topbarAvatar.click();
    await page.waitForURL(/\/account$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);

    await watchForText(page, group.name);
    await resetLoadingProbe(page);
    const delayed = await delayGets(page, listUrl, 1500);
    await new LoginPage(page).login(other.email, other.password);
    await page.waitForURL(/\/groups$/);

    // Cold for the new user: "Loading…" is shown, and the old list never is.
    await expect(page.getByText('Loading your groups...')).toBeVisible();
    await expect(page.getByRole('heading', { name: /e2e-other-user/, level: 2 })).toBeVisible();
    expect(await sawLoading(page)).toBe(true);
    expect(await sawWatchedText(page)).toBe(false);
    await delayed.off();
  });

  test('session loss clears the cache: signing back in starts cold', async ({ pageForUser }) => {
    const { page, owner, group } = await openFreshGroup(pageForUser);

    // Kill both credentials: a garbage access token and a refresh that 401s.
    await page.evaluate((key) => localStorage.setItem(key, 'not-a-jwt'), TOKEN_KEY);
    const refreshRoute = /\/api\/auth\/session\/refresh/;
    await page.route(refreshRoute, (route) => route.fulfill({ status: 401, body: '{}' }));
    await hideAndShow(page); // triggers a refetch → 401 → refresh 401 → session expired

    await page.waitForURL(/\/login\?.*error=expired/);
    await page.unroute(refreshRoute);

    await resetLoadingProbe(page);
    const delayed = await delayGets(page, detailUrl(group.id), 1500);
    await new LoginPage(page).login(owner.email, owner.password);
    // The login redirect brings the user back to the group page…
    await page.waitForURL(new RegExp(`/groups/${group.id}$`));
    // …which loads cold: the cache did not survive the session.
    await expect(balanceCard(page)).toBeVisible();
    expect(await sawLoading(page)).toBe(true);
    await delayed.off();
  });

  test('a reload starts cold and nothing is persisted to storage', async ({ pageForUser }) => {
    const { page, group } = await openFreshGroup(pageForUser, { seedExpense: 'Secret dinner' });

    const stored = await page.evaluate(() => {
      const dump: string[] = [];
      for (const store of [localStorage, sessionStorage]) {
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i)!;
          dump.push(`${key}=${store.getItem(key)}`);
        }
      }
      return dump.join('\n');
    });
    expect(stored).not.toContain(group.name);
    expect(stored).not.toContain('Secret dinner');

    await delayGets(page, detailUrl(group.id), 1500);
    await page.reload();
    await expect(page.getByText('Loading group...')).toBeVisible();
    await expect(expenseRow(page, 'Secret dinner')).toBeVisible();
  });

  test('the refresh-failed notice is translated (Italian)', async ({ pageForUser }) => {
    const owner = await registerNamedUser('Ann');
    const group = await createGroupViaApi(owner, [], 'e2e-cache-it');
    const page = await pageForUser(owner.email, owner.password);
    await page.goto('/account');
    await new AccountPage(page).selectLanguage('it');
    await new AccountPage(page).saveButton.click();
    await expect(page.getByText('Dettagli account')).toBeVisible();

    await page.goto('/groups');
    await new GroupsPage(page).openGroup(group.name);
    await expect(balanceCard(page)).toBeVisible();

    await failGets(page, detailUrl(group.id), 500);
    await hideAndShow(page);

    await expect(
      page.getByText('Aggiornamento non riuscito. Mostro gli ultimi dati caricati.'),
    ).toBeVisible();
  });

  test('opening a group while its prefetch is in flight issues one request, not two', async ({ pageForUser }) => {
    const owner = await registerNamedUser('Ann');
    const group = await createGroupViaApi(owner, [], 'e2e-dedupe');
    const page = await pageForUser(owner.email, owner.password);
    await delayGets(page, detailUrl(group.id), 1500);
    const gets = countRequests(page, isDetailGet(group.id));

    const prefetchStarted = page.waitForRequest(isDetailGet(group.id));
    await page.goto('/groups');
    await prefetchStarted;
    await new GroupsPage(page).openGroup(group.name);
    await expect(balanceCard(page)).toBeVisible();
    await page.waitForTimeout(500);

    expect(gets).toHaveLength(1);
  });
});
