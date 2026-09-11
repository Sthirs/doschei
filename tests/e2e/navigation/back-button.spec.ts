// ADR-0024: the browser Back button and every topbar back arrow are the same
// history operation (goBackTo/goBackOr, lib/backNavigation.ts). This is the
// regression the ADR fixes: before it, saving an expense left the app on
// group-detail but pressing Back re-opened the already-submitted form,
// because every "back" exit was a forward `router.push` rather than a pop.
// Uses the authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import {
  GroupsPage,
  GroupSettingsPage,
  GroupDetailPage,
  acceptInvitationViaApi,
  clearGroupLedgerViaApi,
} from '../pages';

let createdGroupId: string | null = null;

test.afterEach(async () => {
  if (!createdGroupId) return;
  await clearGroupLedgerViaApi(createdGroupId, 'demo@doschei.local', 'password123');
  createdGroupId = null;
});

test('the reported regression: save an expense, then browser Back lands on the groups list, not the submitted form', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-back-btn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  // groups -> group detail -> add expense -> save. Before ADR-0024 the
  // history stack after this sequence was /groups -> /groups/:id ->
  // /groups/:id/expenses/new -> /groups/:id (a forward push at every step),
  // so one Back press would re-enter the already-submitted form.
  await groupDetailPage.clickAddExpense();
  await groupDetailPage.fillDescription('Dinner');
  await groupDetailPage.fillAmount('42.50');
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  await page.goBack();

  await expect(page).toHaveURL(/\/groups$/);
  await groupsPage.expectGroupVisible(groupName);
});

test('the topbar back arrow and the browser Back button reach the same place', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-back-btn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.clickAddExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));

  // The topbar arrow pops history (goBackTo) exactly like Back would here.
  await groupDetailPage.clickBackToGroup();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // One further Back press must reach the groups list, not the form again —
  // proving the arrow click was a real history pop, not an extra forward
  // push that grew the stack.
  await page.goBack();
  await expect(page).toHaveURL(/\/groups$/);
});

test('the group-detail back arrow (Back to groups) and browser Back agree', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-back-btn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  createdGroupId = await groupDetailPage.getGroupId();

  await groupDetailPage.clickBackToGroups();
  await expect(page).toHaveURL(/\/groups$/);

  // Forward, then Back again should return to the group, not double-pop past
  // it — confirming clickBackToGroups() popped exactly one entry.
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/groups/${createdGroupId}$`));
});

test('recording a settlement and pressing Back lands on the groups list', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-back-btn-settle-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  // The settle-up form's payer/payee defaults are computed from an existing
  // balance (computeSettleUpDefaults) — an empty two-person group leaves them
  // blank and the submit button disabled, so an expense creating a debt is
  // required first (mirrors settlements/settle-up.spec.ts's setup). This
  // setup phase uses whatever navigation is convenient (full page.goto
  // reloads included) — only the sequence AFTER it is under test, and it
  // starts fresh from a single full reload of /groups below.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await acceptInvitationViaApi(page, groupId, 'alice@doschei.local', 'password123');
  await page.reload();
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // From here on, every step is a client-side navigation (a real router.push
  // triggered by a click), never page.goto/reload — mixing in a full reload
  // would reset Vue Router's own state.back bookkeeping for that entry back
  // to null (a fresh SPA boot has no memory of the browser history beneath
  // it), which would make goBackTo take its replace fallback instead of the
  // pop this test means to exercise, and would desync page.goBack()'s real
  // browser-history position from the one entry per step this test assumes.
  await page.goto('/groups');
  await groupsPage.openGroup(groupName);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  await groupDetailPage.clickAddExpense();
  await groupDetailPage.setPaidBy('Alice Rossi');
  await groupDetailPage.fillDescription('Dinner');
  await groupDetailPage.fillAmount('20');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  await groupDetailPage.clickSettleUp();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settle-up$`));
  await groupDetailPage.saveSettleUp();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  await page.goBack();

  await expect(page).toHaveURL(/\/groups$/);
});

test('deleting an expense via the confirm panel, then Back never resurrects the deleted expense form', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-back-btn-delete-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await groupDetailPage.clickAddExpense();
  await groupDetailPage.fillDescription('To be deleted');
  await groupDetailPage.fillAmount('10.00');
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  await groupDetailPage.expectExpenseRowVisible({
    description: 'To be deleted',
    amount: '10.00',
    paidByName: 'Demo User',
  });
  // Reaching the edit form by clicking the row (a forward push from
  // group-detail), not gotoEditExpense(), matters here: it reproduces the
  // exact stack shape a real user hits.
  await page.getByTestId('expense-row').filter({ hasText: 'To be deleted' }).click();

  // The delete-confirm panel is itself a routed overlay (useRoutedOverlay
  // ('delete')): opening it, then deleting, drops that overlay entry
  // (closeBeforeLeaving, ADR-0024) via a `replace`, then goToGroupDetail
  // replaces again rather than popping — since the entry's own `back`
  // (fixed at the moment it was originally pushed) points at the edit form,
  // not at group-detail.
  await groupDetailPage.deleteCurrentExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await groupDetailPage.expectNoExpenses();

  // ADR-0024's documented, deliberate trade-off: because the exit above was a
  // `replace`, not a pop, the browser history entry immediately behind the
  // current one is still the (now-deleted) expense's own edit-form URL —
  // one Back press lands there, and the form must degrade to its existing
  // "Expense not found." state rather than breaking. This is accepted as
  // better than the alternative (`replace` after delete unconditionally),
  // which would instead leave a duplicate group-detail entry and a
  // pop-once-does-nothing dead Back press.
  await page.goBack();
  await expect(page.getByText('Expense not found.')).toBeVisible();

  // A further Back press reaches the group again (never a broken state),
  // and one more after that leaves the group entirely.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await groupDetailPage.expectNoExpenses();

  await page.goBack();
  await expect(page).toHaveURL(/\/groups$/);
});
