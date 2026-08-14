// T4.1 — full settle-up lifecycle: create → edit amount → delete.
// One test, one group. Uses the authenticatedPage fixture (no UI login).
// The settle-up form is now a routed page at /groups/:id/settle-up (create)
// and /groups/:id/settlements/:sid/edit (edit) — see ADR-0012.
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

  // Invite Alice so the EQUAL split has two members and the "Who paid" picker has her.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // --- Add a €20.00 expense paid by Alice, split EQUAL across both members. ---
  // Demo User paid nothing → owes Alice 10 (= 20 / 2).
  await page.goto('/groups/' + groupId);
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.setPaidBy('Alice Rossi');
  await groupDetailPage.fillDescription('Test expense');
  await groupDetailPage.fillAmount('20');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.selectSplitMember('Demo User');
  await groupDetailPage.selectSplitMember('Alice Rossi');
  await groupDetailPage.saveExpense();
  // After save, ExpenseFormView navigates back to /groups/:id.
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

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
  // Settle-up form is now a routed page at /groups/:id/settle-up
  // (SettleUpView.vue:67-81). Defaults pick the candidate with greatest |net|;
  // here Demo User owes Alice €10, so the form should pre-fill payer=Demo User,
  // payee=Alice, amount=10.
  await groupDetailPage.gotoSettleUpCreate(groupId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settle-up$`));
  expect(await groupDetailPage.getSettleUpAmount()).toBe('10');

  // --- Save the settlement and assert the row + balance update. ---
  await groupDetailPage.saveSettleUp();
  // SettleUpView.vue:152-156 — submit() navigates back to /groups/:id.
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await groupDetailPage.expectSettlementRowVisible({
    payerName: 'Demo User',
    payeeName: 'Alice Rossi',
    amount: '10',
  });
  await expect(page.getByText('Settled', { exact: true })).toBeVisible();

  // --- Look up the settlement id from the API so we can target the edit
  //     route directly (no need to click the row + scrape the URL). ---
  const token = await page.evaluate(() => localStorage.getItem('doschei.auth.token'));
  const groupResponse = await page.request.get(`/api/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(groupResponse.status()).toBe(200);
  const groupJson = (await groupResponse.json()) as {
    group: { expenses: Array<{ id: string; kind: string }> };
  };
  const settlement = groupJson.group.expenses.find((e) => e.kind === 'SETTLEMENT');
  expect(settlement, 'expected a SETTLEMENT expense on the group').toBeDefined();
  const settlementId = settlement!.id;

  // --- Open the settlement in edit mode, change amount to 5, save. ---
  await groupDetailPage.gotoSettleUpEdit(groupId, settlementId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settlements/${settlementId}/edit$`));
  await groupDetailPage.setSettleUpAmount('5');
  await groupDetailPage.saveSettleUp();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- Assert partial-balance: overall line "You owe €5.00". ---
  // Anchor on the ALWAYS-VISIBLE overall line (GroupDetailView.vue:707-710),
  // not the per-user row: the edit-to-5 step recreated a fresh closed
  // breakdown toggle, and the overall line is a single exact match (no strict-
  // mode ambiguity, no disclosure dependency).
  await expect(page.getByText('You owe €5.00', { exact: true })).toBeVisible();

  // --- Delete the settlement, balance returns to the pre-settlement state. ---
  await groupDetailPage.gotoSettleUpEdit(groupId, settlementId);
  await groupDetailPage.deleteCurrentSettlement();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  // Overall line — scope to the balance card because the expense row badge
  // also renders exactly "You owe €10.00" (the €20 expense split equal).
  await expect(
    page.locator('section').filter({ hasText: 'Your Balance' }).getByText('You owe €10.00', { exact: true }),
  ).toBeVisible();
});
