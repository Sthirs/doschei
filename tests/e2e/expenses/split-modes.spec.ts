// Happy paths for the three split modes the spec defines (docs/specifications.md
// §Features: "Equal split … or among a selected subset of users", "Exact split",
// "Percentage split"), plus the guard that keeps an invalid split from being
// saved (including an amount with more than two decimals, which the API
// rejects). Every other expense spec uses the Equally tab with all members, so
// the Percentage and Fixed tabs and a partial Equally selection were never
// driven end to end.
//
// Each test builds its own three-member group over the API with fresh users,
// so balances are known exactly and the shared demo user is never touched.
import { expect, test } from '../fixtures/auth';
import {
  createGroupViaApi,
  fetchBalanceViaApi,
  fetchExpensesViaApi,
  registerNamedUser,
} from '../fixtures/groups';
import { GroupDetailPage } from '../pages';

const setupThreeMemberGroup = async () => {
  const owner = await registerNamedUser('Olga');
  const percy = await registerNamedUser('Percy');
  const quinn = await registerNamedUser('Quinn');
  const group = await createGroupViaApi(owner, [percy, quinn], 'e2e-split');
  return { owner, percy, quinn, group };
};

const expandBreakdown = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'See breakdown' }).click();
  return page.getByTestId('balance-breakdown');
};

test('percentage split: allocates by percent, reopens on the Percentage tab, and updates balances', async ({
  pageForUser,
}) => {
  const { owner, percy, quinn, group } = await setupThreeMemberGroup();
  const page = await pageForUser(owner.email, owner.password);
  const groupDetailPage = new GroupDetailPage(page);

  await groupDetailPage.gotoAddExpense(group.id);
  await groupDetailPage.fillDescription('Cabin rental');
  await groupDetailPage.fillAmount('90');
  await groupDetailPage.setPercentSplit({ [owner.displayName]: 50, [percy.displayName]: 30, [quinn.displayName]: 20 });
  await expect(page.getByText('Total: 100.0%')).toBeVisible();
  await groupDetailPage.saveExpense();

  await groupDetailPage.expectExpenseRowVisible({ description: 'Cabin rental', amount: '90', paidByName: owner.displayName });
  // Owner paid 90 and owes 45 → owed 27 by Percy and 18 by Quinn.
  await expect(page.getByText('You are owed €45.00')).toBeVisible();
  const breakdown = await expandBreakdown(page);
  await expect(breakdown.getByRole('listitem').filter({ hasText: `${percy.displayName} owes you` })).toContainText('€27.00');
  await expect(breakdown.getByRole('listitem').filter({ hasText: `${quinn.displayName} owes you` })).toContainText('€18.00');

  const [saved] = await fetchExpensesViaApi(owner, group.id);
  expect(saved.splits.map((split) => split.shareType)).toEqual(['PERCENT', 'PERCENT', 'PERCENT']);
  expect(saved.splits.reduce((sum, split) => sum + Math.round(split.computedAmount * 100), 0)).toBe(9000);

  // Reopening the expense restores the Percentage tab with the saved values.
  await page.getByTestId('expense-row').filter({ hasText: 'Cabin rental' }).click();
  await expect(page).toHaveURL(/\/expenses\/[^/]+\/edit$/);
  await expect(page.getByText('Total: 100.0%')).toBeVisible();
  const percyRow = page.locator('div.flex.items-center.gap-2').filter({ hasText: percy.displayName }).filter({ hasText: '%' });
  await expect(percyRow.getByRole('spinbutton')).toHaveValue('30');
});

test('fixed split: allocates the exact amounts entered for each member', async ({ pageForUser }) => {
  const { owner, percy, quinn, group } = await setupThreeMemberGroup();
  const page = await pageForUser(owner.email, owner.password);
  const groupDetailPage = new GroupDetailPage(page);

  await groupDetailPage.gotoAddExpense(group.id);
  await groupDetailPage.fillDescription('Concert tickets');
  await groupDetailPage.fillAmount('50');
  await groupDetailPage.setFixedSplit({ [owner.displayName]: 10, [percy.displayName]: 25.5, [quinn.displayName]: 14.5 });
  await groupDetailPage.saveExpense();

  await groupDetailPage.expectExpenseRowVisible({ description: 'Concert tickets', amount: '50', paidByName: owner.displayName });
  await expect(page.getByText('You are owed €40.00')).toBeVisible();
  const breakdown = await expandBreakdown(page);
  await expect(breakdown.getByRole('listitem').filter({ hasText: `${percy.displayName} owes you` })).toContainText('€25.50');
  await expect(breakdown.getByRole('listitem').filter({ hasText: `${quinn.displayName} owes you` })).toContainText('€14.50');

  // The other side of the ledger sees the mirror image.
  expect((await fetchBalanceViaApi(percy, group.id)).netForCurrentUser).toBe(-25.5);
  expect((await fetchBalanceViaApi(quinn, group.id)).netForCurrentUser).toBe(-14.5);
});

test('equal split among a subset: a deselected member owes nothing', async ({ pageForUser }) => {
  const { owner, percy, quinn, group } = await setupThreeMemberGroup();
  const page = await pageForUser(owner.email, owner.password);
  const groupDetailPage = new GroupDetailPage(page);

  await groupDetailPage.gotoAddExpense(group.id);
  await groupDetailPage.fillDescription('Taxi for two');
  await groupDetailPage.fillAmount('30');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember(owner.displayName);
  await groupDetailPage.selectSplitMember(percy.displayName);
  await groupDetailPage.deselectSplitMember(quinn.displayName);
  await groupDetailPage.saveExpense();

  await expect(page.getByText('You are owed €15.00')).toBeVisible();
  const breakdown = await expandBreakdown(page);
  await expect(breakdown.getByRole('listitem')).toHaveCount(1);
  await expect(breakdown.getByRole('listitem').filter({ hasText: `${percy.displayName} owes you` })).toContainText('€15.00');

  const [saved] = await fetchExpensesViaApi(owner, group.id);
  expect(saved.splits.map((split) => split.userId).sort()).toEqual([owner.id, percy.id].sort());
  expect((await fetchBalanceViaApi(quinn, group.id)).netForCurrentUser).toBe(0);
});

test('an invalid percentage or fixed split blocks saving and explains why', async ({ pageForUser }) => {
  const { owner, percy, quinn, group } = await setupThreeMemberGroup();
  const page = await pageForUser(owner.email, owner.password);
  const groupDetailPage = new GroupDetailPage(page);
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });

  await groupDetailPage.gotoAddExpense(group.id);
  await groupDetailPage.fillDescription('Groceries');
  await groupDetailPage.fillAmount('60');

  await groupDetailPage.setPercentSplit({ [owner.displayName]: 50, [percy.displayName]: 30, [quinn.displayName]: 10 });
  await expect(page.getByText('Percentages must sum to 100 (current: 90.00).')).toBeVisible();
  await expect(saveButton).toBeDisabled();

  await groupDetailPage.setFixedSplit({ [owner.displayName]: 20, [percy.displayName]: 20, [quinn.displayName]: 10 });
  await expect(page.getByText('Fixed amounts must sum to €60.00 (current: €50.00).')).toBeVisible();
  await expect(saveButton).toBeDisabled();

  // Fixing the split re-enables Save.
  await groupDetailPage.setFixedSplit({ [quinn.displayName]: 20 });
  await expect(saveButton).toBeEnabled();

  // A sub-cent amount is refused up front rather than failing on save.
  await groupDetailPage.fillAmount('60.005');
  await expect(page.getByText('Enter an amount with at most two decimals, up to 99,999,999.99.')).toBeVisible();
  await expect(saveButton).toBeDisabled();
  await groupDetailPage.fillAmount('60');
  await expect(saveButton).toBeEnabled();
  await groupDetailPage.saveExpense();
  expect(await fetchExpensesViaApi(owner, group.id)).toHaveLength(1);
});
