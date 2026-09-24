// Happy path for the group category recap modal: create a group, invite Alice
// so splits have two members, add a food and a transportation expense in the
// current month plus a settle-up (excluded), and a home expense in the month
// before, then open Categories and assert all seven families always render —
// the two/one with spend, and the rest at €0.00 — in the same fixed family
// order every month, and the one-month-at-a-time stepper. Uses the
// authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import {
  GroupsPage,
  GroupSettingsPage,
  GroupDetailPage,
  acceptInvitationViaApi,
  clearGroupLedgerViaApi,
} from '../pages';

// The stepper is relative to today, so expected month labels are derived the
// same way rather than hard-coded to a calendar month.
const monthStart = (monthsAgo: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
};

const dateInMonth = (monthsAgo: number, day: number): string => {
  const d = monthStart(monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const monthLabel = (monthsAgo: number): string =>
  monthStart(monthsAgo).toLocaleDateString('en', { month: 'long', year: 'numeric' });

// Every family that isn't Food & Drink or Transportation must still show, at
// €0.00 · 0.0%, in the fixed family order (ADR-0026 §Decision item 3).
const ZERO_FAMILIES_THIS_MONTH = ['home', 'life', 'utilities', 'entertainment', 'uncategorized'];

let createdGroupId: string | null = null;

test.afterEach(async () => {
  if (!createdGroupId) return;
  await clearGroupLedgerViaApi(createdGroupId, 'demo@doschei.local', 'password123');
  createdGroupId = null;
});

test('view a month of group spend broken down by category family', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: unique group so we don't collide with parallel runs. ---
  await page.goto('/groups');
  const groupName = 'e2e-category-recap-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();
  createdGroupId = groupId;

  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await acceptInvitationViaApi(page, groupId, 'alice@doschei.local', 'password123');
  await page.reload();
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // --- €90 Groceries (food-and-drink) this month, split equally. ---
  await page.goto('/groups/' + groupId);
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.fillDescription('Groceries');
  await groupDetailPage.fillAmount('90');
  await groupDetailPage.setCategory('Groceries');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.setDate(dateInMonth(0, 1));
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- €30 Taxi (transportation) this month, split equally. ---
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.fillDescription('Taxi');
  await groupDetailPage.fillAmount('30');
  await groupDetailPage.setCategory('Taxi');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.setDate(dateInMonth(0, 2));
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- A settle-up this month, which must NOT count as spend. ---
  await groupDetailPage.gotoSettleUpCreate(groupId);
  await groupDetailPage.setSettleUpPayer('Demo User');
  await groupDetailPage.setSettleUpPayee('Alice Rossi');
  await groupDetailPage.setSettleUpAmount('15');
  await groupDetailPage.saveSettleUp();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- €60 Rent (home) last month, split equally. ---
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.fillDescription('Rent');
  await groupDetailPage.fillAmount('60');
  await groupDetailPage.setCategory('Rent');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.setDate(dateInMonth(1, 15));
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- Default view: the current month. ---
  await groupDetailPage.openCategoryRecapModal();
  expect(await groupDetailPage.getCategoryRecapMonth()).toBe(monthLabel(0));

  const rows = await groupDetailPage.getCategoryRecapRows();
  expect(rows).toHaveLength(7);
  expect(rows.map((r) => r.family)).toEqual([
    'food-and-drink',
    'transportation',
    ...ZERO_FAMILIES_THIS_MONTH,
  ]);
  expect(rows[0].text).toContain('€90.00');
  expect(rows[0].text).toContain('75.0%');
  expect(rows[1].text).toContain('€30.00');
  expect(rows[1].text).toContain('25.0%');
  for (const row of rows.slice(2)) {
    expect(row.text).toContain('€0.00');
    expect(row.text).toContain('0.0%');
  }

  // The settle-up is excluded, so the total is 90 + 30, not 90 + 30 + 15.
  expect(await groupDetailPage.getCategoryRecapTotal()).toBe('€120.00');
  expect(await groupDetailPage.getCategoryRecapSummary()).toBe(
    '2 expenses · your share €60.00',
  );

  // The month never runs past the current one.
  await groupDetailPage.expectCategoryRecapCannotGoForward();

  // --- Stepping back moves to last month: only Home has spend. ---
  await groupDetailPage.categoryRecapPreviousMonth();
  expect(await groupDetailPage.getCategoryRecapMonth()).toBe(monthLabel(1));

  const lastMonthRows = await groupDetailPage.getCategoryRecapRows();
  expect(lastMonthRows).toHaveLength(7);
  // Same fixed family order as the default view: home is 3rd, not first,
  // even though it's the only family with spend this month.
  expect(lastMonthRows.map((r) => r.family)).toEqual([
    'food-and-drink',
    'transportation',
    'home',
    'life',
    'utilities',
    'entertainment',
    'uncategorized',
  ]);
  expect(lastMonthRows[2].text).toContain('€60.00');
  expect(lastMonthRows[2].text).toContain('100.0%');
  for (const row of lastMonthRows.filter((r) => r.family !== 'home')) {
    expect(row.text).toContain('€0.00');
    expect(row.text).toContain('0.0%');
  }
  expect(await groupDetailPage.getCategoryRecapTotal()).toBe('€60.00');

  // --- Stepping forward returns to the default view. ---
  await groupDetailPage.categoryRecapNextMonth();
  expect(await groupDetailPage.getCategoryRecapMonth()).toBe(monthLabel(0));
  await groupDetailPage.expectCategoryRecapCannotGoForward();
});
