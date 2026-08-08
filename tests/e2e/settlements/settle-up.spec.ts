// T4.1 — full settle-up lifecycle: create → edit amount → delete.
// One test, one group. Uses the authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage, GroupDetailPage } from '../pages';

test('settle-up lifecycle: create → edit amount → delete', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: create a uniquely-named group and invite Alice so she's a member. ---
  await page.goto('/groups');
  const groupName = 'e2e-settle-up-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();

  // Invite Alice so the EQUAL split has two members and the "Paid by" picker has her.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // --- Add a €20.00 expense paid by Alice, split EQUAL across both members. ---
  // Demo User paid nothing → owes Alice 10 (= 20 / 2).
  await page.goto('/groups/' + groupId);
  await groupDetailPage.openAddExpense();
  await groupDetailPage.setPaidBy('Alice Rossi');
  await groupDetailPage.fillDescription('Test expense');
  await groupDetailPage.fillAmount('20');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.saveExpense();

  // --- Assert pre-settlement balance: "You owe Alice Rossi €10.00". ---
  // The per-user balance rows live behind a "See breakdown" button
  // (GroupDetailView.vue:736-764) that is COLLAPSED by default. Expand it
  // before asserting. The entry renders the name and amount as two separate
  // spans inside the row, so anchor on the name span only. (A subsequent
  // full settlement zeroes perUser and removes the toggle, so later balances
  // anchor on the always-visible overall line instead — see EDIT B/C.)
  await page.getByText('See breakdown').click();
  await expect(page.getByText('You owe Alice Rossi', { exact: true })).toBeVisible();

  // --- Open Settle up and assert the pre-filled amount + payer. ---
  // T3.1 spec: defaults pick the candidate with greatest |net|; here Demo User
  // owes Alice €10, so the form should pre-fill payer=Demo User, payee=Alice,
  // amount=10.
  await groupDetailPage.openSettleUp();
  expect(await groupDetailPage.getSettleUpAmount()).toBe('10');

  // --- Save the settlement and assert the row + balance update. ---
  await groupDetailPage.saveSettleUp();
  await groupDetailPage.expectSettlementRowVisible({
    payerName: 'Demo User',
    payeeName: 'Alice Rossi',
    amount: '10',
  });
  await expect(page.getByText('Settled', { exact: true })).toBeVisible();

  // --- Open the settlement, change amount to 5, save. ---
  // The T3.5 notepad warns that opening a settlement for editing may silently
  // replace the saved amount with the live balance number when amountTouched is
  // false — `setSettleUpAmount` fires the @input handler and sets amountTouched,
  // so the 5 we type here is what gets saved.
  await groupDetailPage.openSettlement('Demo User', 'Alice Rossi');
  await groupDetailPage.setSettleUpAmount('5');
  await groupDetailPage.saveSettleUp();

  // --- Assert partial-balance: overall line "You owe €5.00". ---
  // Anchor on the ALWAYS-VISIBLE overall line (GroupDetailView.vue:707-710),
  // not the per-user row: the edit-to-5 step recreated a fresh closed
  // breakdown toggle, and the overall line is a single exact match (no strict-
  // mode ambiguity, no disclosure dependency).
  await expect(page.getByText('You owe €5.00', { exact: true })).toBeVisible();

  // --- Delete the settlement, balance returns to the pre-settlement state. ---
  await groupDetailPage.openSettlement('Demo User', 'Alice Rossi');
  await groupDetailPage.deleteCurrentSettlement();
  // Overall line — scope to the balance card because the expense row badge
  // also renders exactly "You owe €10.00" (the €20 expense split equal).
  await expect(
    page.locator('section').filter({ hasText: 'Your Balance' }).getByText('You owe €10.00', { exact: true }),
  ).toBeVisible();
});
