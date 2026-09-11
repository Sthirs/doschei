// ADR-0024: dismissable overlays (Totals, Export) are represented as
// `?overlay=<id>` route state (useRoutedOverlay), so the browser Back button
// closes them — the app must never leave the user thrown off the page with
// the overlay still open. Uses the authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupDetailPage, clearGroupLedgerViaApi } from '../pages';

let createdGroupId: string | null = null;

test.afterEach(async () => {
  if (!createdGroupId) return;
  await clearGroupLedgerViaApi(createdGroupId, 'demo@doschei.local', 'password123');
  createdGroupId = null;
});

test('browser Back closes the Totals modal and stays on the group', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-overlay-back-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.openTotalsModal();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}\\?overlay=totals$`));

  await page.goBack();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await groupDetailPage.expectTotalsModalHidden();
});

test('browser Back closes the Export modal and stays on the group', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-overlay-back-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.openExportModal();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}\\?overlay=export$`));

  await page.goBack();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await groupDetailPage.expectExportModalHidden();
});

test('closing Totals with the X button consumes the history entry, so one further Back leaves the group', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-overlay-back-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.openTotalsModal();
  await groupDetailPage.closeTotalsModal();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // The X button popped its own entry (useRoutedOverlay.close -> goBackTo),
  // not pushed a new one — so pressing Back now must NOT re-open Totals; it
  // must leave the group, exactly as if Totals had never been opened.
  await page.goBack();

  await expect(page).toHaveURL(/\/groups$/);
});

test('a deep link straight into ?overlay=totals renders the dialog, and the X button clears the query', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-overlay-back-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await page.goto(`/groups/${groupId}?overlay=totals`);
  await expect(page.getByRole('dialog', { name: 'Totals' })).toBeVisible();

  await groupDetailPage.closeTotalsModal();

  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
});
