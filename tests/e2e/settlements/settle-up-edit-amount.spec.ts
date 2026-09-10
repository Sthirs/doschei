// Regression test: opening a settlement for EDIT must show the settlement's
// OWN saved amount, not the current outstanding balance. In useSettleUpForm.ts,
// initialise() (edit branch) sets payerId/payeeId/amount from the settlement,
// but setting payerId/payeeId triggers watch([payerId, payeeId]) which — since
// amountTouched is false — overwrites amount with settlementAmountFor(...)
// (the live outstanding balance). This only surfaces when the settlement was
// a PARTIAL payment (amount != outstanding balance); a full settlement leaves
// an outstanding balance of 0 and the watcher's overwrite is a no-op, which is
// why it isn't caught by tests/e2e/settlements/settle-up.spec.ts.
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage, GroupDetailPage, acceptInvitationViaApi } from '../pages';

test('settle-up edit form shows the settlement amount, not the outstanding balance', async ({
  authenticatedPage: page,
}) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: create a uniquely-named group and invite Alice so she's a member. ---
  await page.goto('/groups');
  const groupName = 'e2e-settle-up-edit-amount-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();

  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await acceptInvitationViaApi(page, groupId, 'alice@doschei.local', 'password123');
  await page.reload();
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
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- Open the create form: amount must be prefilled with the outstanding
  //     balance (10). This create-mode behaviour is correct and must stay. ---
  await groupDetailPage.gotoSettleUpCreate(groupId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settle-up$`));
  expect(await groupDetailPage.getSettleUpAmount()).toBe('10');

  // --- Change it to a PARTIAL amount (4, not the full 10) and save. Demo
  //     User still owes Alice 6 after this settlement. ---
  await groupDetailPage.setSettleUpAmount('4');
  await groupDetailPage.saveSettleUp();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await groupDetailPage.expectSettlementRowVisible({
    payerName: 'Demo User',
    payeeName: 'Alice Rossi',
    amount: '4',
  });

  // --- Open the settlement for editing the way a real user does it: click
  //     the settlement row (GroupDetailView.vue navigateToSettleUpEdit). ---
  await groupDetailPage.clickSettlementRow();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/settlements/[^/]+/edit$`));

  // --- The edit form must show the settlement's OWN stored amount (4), NOT
  //     the current outstanding balance (6). Use a polling assertion so a
  //     late-running watch([payerId, payeeId]) overwrite (which fires AFTER
  //     initialise() sets amount, once payerId/payeeId are applied) is caught
  //     even if it lands a tick after the initial render. ---
  await expect.poll(() => groupDetailPage.getSettleUpAmount()).toBe('4');
});
