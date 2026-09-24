// ADR-0027: every modal/picker sheet slides up on open and down on close, and
// can be dismissed by dragging its handle or header down past a threshold —
// exactly like the X button. Uses the authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupDetailPage, clearGroupLedgerViaApi } from '../pages';

let createdGroupId: string | null = null;

test.afterEach(async () => {
  if (!createdGroupId) return;
  await clearGroupLedgerViaApi(createdGroupId, 'demo@doschei.local', 'password123');
  createdGroupId = null;
});

test('dragging the Totals header down past the threshold dismisses it, like the X button', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-sheet-motion-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.openTotalsModal();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}\\?overlay=totals$`));

  await groupDetailPage.dragTotalsSheetDown(300);

  await groupDetailPage.expectTotalsModalHidden();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
});

test('a short drag on the Totals header snaps back without dismissing it', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-sheet-motion-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.openTotalsModal();

  // Well under the 30%-of-panel-height dismiss threshold, held briefly before
  // release so it also reads as slow rather than a fast flick.
  await groupDetailPage.dragTotalsSheetDown(40, { pauseBeforeReleaseMs: 200 });

  await expect(page.getByRole('dialog', { name: 'Totals' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}\\?overlay=totals$`));

  // The sheet still closes normally afterwards — the snap-back left no stray
  // state behind.
  await groupDetailPage.closeTotalsModal();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
});

test('dragging the DateTimePicker handle down past the threshold closes it on a mobile viewport', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/groups');
  const groupName = 'e2e-sheet-motion-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.gotoAddExpense(groupId);

  await page.locator('[data-test-id="dtp"]').click();
  const dateDialog = page.getByRole('dialog', { name: 'Select date' });
  await expect(dateDialog).toBeVisible();

  await groupDetailPage.dragDateTimeSheetDown(300);

  await expect(dateDialog).not.toBeVisible();
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the Totals button reopens the sheet right after a flick dismissed it', async ({
    authenticatedPage: page,
  }) => {
    const groupsPage = new GroupsPage(page);
    const groupDetailPage = new GroupDetailPage(page);

    await page.goto('/groups');
    const groupName = 'e2e-sheet-motion-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    await groupsPage.createGroup(groupName);
    await groupsPage.openGroup(groupName);
    const groupId = await groupDetailPage.getGroupId();
    createdGroupId = groupId;

    const totalsButton = page.getByRole('button', { name: /^Totals$/, exact: true });
    const totalsDialog = page.getByRole('dialog', { name: 'Totals' });

    await totalsButton.tap();
    await expect(totalsDialog).toBeVisible();

    // A fast touch flick, released without pausing. Playwright's touchscreen
    // only taps, so the drag goes through CDP directly. Chrome turns an
    // unconsumed flick into a fling and swallows the next tap as the one
    // that stopped it — the regression this guards against.
    await page.waitForTimeout(200);
    const box = await totalsDialog.locator('[data-sheet-drag]:visible').first().boundingBox();
    if (!box) throw new Error('Sheet drag handle is not visible');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 30 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(totalsDialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

    await totalsButton.tap();
    await expect(totalsDialog).toBeVisible();
  });
});
