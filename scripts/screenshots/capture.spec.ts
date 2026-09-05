// ---------------------------------------------------------------------------
// Generates the three screenshots embedded in README.md.
//
//   npm run screenshots -- http://doschei.<minikube-ip>.nip.io
//
// This is a doc-asset generator, not part of the e2e suite — see
// playwright.screenshots.config.ts for why it lives outside tests/e2e/.
// ---------------------------------------------------------------------------
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { test, expect, type Browser, type Page } from '@playwright/test';

import { GroupDetailPage } from '../../tests/e2e/pages/GroupDetailPage';
import { GroupsPage } from '../../tests/e2e/pages/GroupsPage';
import { ANCHOR, buildDataset, preflight, type Dataset } from './fixtures';

const OUT_DIR = 'docs/screenshots';
const TOKEN_KEY = 'doschei.auth.token';

const SHOTS = {
  groups: '01-groups.png',
  detail: '02-group-detail.png',
  settleUp: '03-settle-up.png',
  totals: '04-totals.png',
} as const;

/** A blank or truncated render must never reach the repo. */
const MIN_BYTES = 8_000;
/** The `check-added-large-files` pre-commit hook rejects anything above 500 KB. */
const MAX_BYTES = 500_000;

let page: Page;
let data: Dataset;

/**
 * Hold everything still: no transitions to catch mid-flight, and no scrollbar
 * gutters in the frame. The app shell is `overflow-hidden` with inner scroll
 * regions, so this only affects those inner regions.
 */
async function freezeChrome(target: Page): Promise<void> {
  await target.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
    `,
  });
}

/** Wait for fonts and the last paint before capturing. */
async function settle(target: Page): Promise<void> {
  await target.waitForLoadState('networkidle');
  await target.evaluate(() => document.fonts.ready);
  await target.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}

async function capture(target: Page, name: string): Promise<void> {
  await freezeChrome(target);
  await settle(target);
  await target.screenshot({
    path: resolve(OUT_DIR, name),
    // Must read as a phone screen. The shell never scrolls the document, so
    // fullPage would be identical on the detail view and would stretch the
    // canvas past the phone frame on the groups list.
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, baseURL }) => {
  const host = baseURL as string;

  await preflight(host);
  data = await buildDataset(host);

  const context = await browser.newContext({
    // Inline storageState instead of the shared tests/e2e/.auth/ cache: no file
    // writes, and no chance of picking up a stale token for another user.
    storageState: {
      cookies: [],
      origins: [
        { origin: host, localStorage: [{ name: TOKEN_KEY, value: data.ownerToken }] },
      ],
    },
  });

  // setFixedTime, not clock.install: install also fakes timers, which would
  // stall the category-suggest debounce and Vue's transition hooks.
  await context.clock.setFixedTime(ANCHOR);

  page = await context.newPage();
});

test.afterAll(async () => {
  await page?.context().close();
});

test('groups list', async () => {
  const groups = new GroupsPage(page);

  await page.goto('/groups');

  await groups.expectGroupVisible('Weekend in Venice');
  await groups.expectBalanceChip('Weekend in Venice', 'You are owed');
  await groups.expectBalanceChip('Holiday in Palermo', 'You owe');
  await groups.expectBalanceChip('Office Lunch', 'You are owed');
  // Exactly three cards: catches both a half-loaded list and stray residue.
  await expect(page.getByTestId('group-card')).toHaveCount(3);
  await expect(page.getByTestId('member-avatar').first()).toBeVisible();
  // Every card shows its uploaded photo, not the gradient-and-initials tile
  // GroupsView.vue falls back to when imageUrl is null.
  await expect(page.getByTestId('group-card').locator('img')).toHaveCount(3);
  // A freshly registered owner has no pending invitations, so the Invitations
  // section is absent and nothing pushes the cards below the fold.
  await groups.expectInvitationsSectionHidden();

  await capture(page, SHOTS.groups);
});

test('group expenses and balances', async () => {
  await page.goto(`/groups/${data.veniceId}`);

  await new GroupDetailPage(page).expectExpenseRowVisible({
    description: 'Spritz round',
    amount: '20',
    paidByName: 'Alice Rossi',
  });
  // All seven are in the DOM; only the ones above the sticky "+ Add expense"
  // button are in frame, which is the intended "scrollable list" look.
  await expect(page.getByTestId('expense-row')).toHaveCount(7);

  // BalanceCard.vue keeps the per-person breakdown collapsed by default.
  await page.getByRole('button', { name: 'See breakdown' }).click();
  await expect(page.getByText('Alice Rossi owes you')).toBeVisible();

  await capture(page, SHOTS.detail);
});

test('settle up', async () => {
  const detail = new GroupDetailPage(page);

  await detail.gotoSettleUpCreate(data.palermoId);

  // computeSettleUpDefaults picks the counterpart with the largest |net|:
  // Alice is owed 57.00 and Bob 31.00, so the form prefills Alice at 57.
  // Waiting on the prefilled amount also gates on GET /groups/:id resolving.
  await expect(async () => {
    expect(await detail.getSettleUpAmount()).toBe('57');
  }).toPass();
  await expect(page.getByTestId('payee-picker')).toContainText('Alice Rossi');

  await capture(page, SHOTS.settleUp);
});

test('monthly totals', async () => {
  const detail = new GroupDetailPage(page);

  await page.goto(`/groups/${data.veniceId}`);
  await detail.openTotalsModal();

  // Venice spans the three months the chart windows over, so all three bars
  // carry a group total and a nested share of your own — 80/60/64, shares
  // 40/30/32. A share too small to label legibly renders no label, which is why
  // the months are kept comparable rather than tapering off.
  await expect(page.getByTestId('totals-bar-group')).toHaveCount(3);
  await expect(page.getByTestId('totals-bar-user')).toHaveCount(3);
  await expect(page.getByTestId('totals-period-total')).toContainText('204');

  await capture(page, SHOTS.totals);
});

test('captured files look sane', () => {
  for (const name of Object.values(SHOTS)) {
    const { size } = statSync(resolve(OUT_DIR, name));
    expect(size, `${name} looks blank or truncated (${size} bytes)`).toBeGreaterThan(MIN_BYTES);
    expect(size, `${name} exceeds the 500KB pre-commit limit (${size} bytes)`).toBeLessThan(MAX_BYTES);
  }
});
