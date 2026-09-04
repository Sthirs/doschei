// Happy path for the group Totals modal: create a group, invite Alice so splits
// have two members, add one expense in the current month and one in the month
// before, record a settle-up, then open Totals and assert the three-month chart,
// its period total, and the one-month-at-a-time stepper. Uses the
// authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import {
  GroupsPage,
  GroupSettingsPage,
  GroupDetailPage,
  acceptInvitationViaApi,
  clearGroupLedgerViaApi,
} from '../pages';

// The chart window is relative to today, so the expected labels are derived the
// same way rather than hard-coded to a calendar month.
const monthStart = (monthsAgo: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
};

const dateInMonth = (monthsAgo: number, day: number): string => {
  const d = monthStart(monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const rangeLabel = (newestMonthsAgo: number): string => {
  const label = (d: Date) => d.toLocaleDateString('en', { month: 'short', year: 'numeric' });
  return `${label(monthStart(newestMonthsAgo + 2))} – ${label(monthStart(newestMonthsAgo))}`;
};

// The group survives the test (there is no group-delete endpoint), so its ledger
// is cleared instead. Without this the group keeps the demo user at a +30 balance
// and adds a permanent "You are owed …" chip to the shared groups list, which
// other specs assert against. Runs in afterEach so a mid-test failure still
// cleans up.
let createdGroupId: string | null = null;

test.afterEach(async () => {
  if (!createdGroupId) return;
  await clearGroupLedgerViaApi(createdGroupId, 'demo@doschei.local', 'password123');
  createdGroupId = null;
});

test('view group spend against your own share over three months', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: unique group so we don't collide with parallel runs. ---
  await page.goto('/groups');
  const groupName = 'e2e-totals-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  // Invite Alice so an EQUAL split gives Demo User half rather than the whole
  // amount, which is what makes the stacked bar have two visible segments.
  // Under ADR-0014 Alice is only invited until she accepts, so the accept step
  // runs via the API helper before she appears as a member.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await acceptInvitationViaApi(page, groupId, 'alice@doschei.local', 'password123');
  await page.reload();
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // --- €90 in the current month, split equally → Demo User's share is €45. ---
  await page.goto('/groups/' + groupId);
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.fillDescription('Current month groceries');
  await groupDetailPage.fillAmount('90');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.setDate(dateInMonth(0, 1));
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- €60 in the previous month, split equally → Demo User's share is €30. ---
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.fillDescription('Last month dinner');
  await groupDetailPage.fillAmount('60');
  await groupDetailPage.setPaidBy('Alice Rossi');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.setDate(dateInMonth(1, 15));
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- A settle-up in the current month, which must NOT count as spend. ---
  await groupDetailPage.gotoSettleUpCreate(groupId);
  await groupDetailPage.setSettleUpPayer('Demo User');
  await groupDetailPage.setSettleUpPayee('Alice Rossi');
  await groupDetailPage.setSettleUpAmount('15');
  await groupDetailPage.saveSettleUp();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- Default window: two months back through the current month. ---
  await groupDetailPage.openTotalsModal();
  expect(await groupDetailPage.getTotalsRange()).toBe(rangeLabel(0));

  // Oldest month is empty; then €60, then €90. The €15 settlement is excluded,
  // so the current month stays at €90 rather than €105.
  expect(await groupDetailPage.getTotalsGroupLabels()).toEqual(['€0', '€60', '€90']);
  // Demo User's share of each month that has spend. The empty month draws no bar
  // and therefore contributes no user label.
  expect(await groupDetailPage.getTotalsUserLabels()).toEqual(['€30', '€45']);
  expect(await groupDetailPage.getTotalsPeriodTotal()).toBe('€150.00');

  // The window never runs past the current month.
  await groupDetailPage.expectTotalsCannotGoForward();

  // --- Stepping back moves the window exactly one month. ---
  await groupDetailPage.totalsPreviousPeriod();
  expect(await groupDetailPage.getTotalsRange()).toBe(rangeLabel(1));
  expect(await groupDetailPage.getTotalsGroupLabels()).toEqual(['€0', '€0', '€60']);
  expect(await groupDetailPage.getTotalsPeriodTotal()).toBe('€60.00');

  // --- And stepping forward returns to the default window. ---
  await groupDetailPage.totalsNextPeriod();
  expect(await groupDetailPage.getTotalsRange()).toBe(rangeLabel(0));
  expect(await groupDetailPage.getTotalsGroupLabels()).toEqual(['€0', '€60', '€90']);
  await groupDetailPage.expectTotalsCannotGoForward();
});
