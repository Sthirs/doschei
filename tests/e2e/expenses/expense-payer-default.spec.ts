// Discriminating test for the expense-form "Paid by" default selection.
//
// WHY THIS TEST DISCRIMINATES OLD VS NEW BEHAVIOR:
// - Demo creates the group → Demo is members[0] (the creator).
// - Alice accepts the invitation → Alice is members[1] (the invitee).
// - Alice opens the Add-Expense form.
// - OLD behavior (before the fix): the form preselects members[0] (Demo User).
// - NEW behavior (after the fix): the form preselects the CURRENT USER (Alice Rossi).
// This test asserts the NEW behavior by checking that Alice's chip carries the
// selection ring and Demo User's chip does NOT.

import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage, GroupDetailPage, acceptInvitationViaApi } from '../pages';

test('expense form defaults Paid by to the current user (not the group creator)', async ({ pageForUser }) => {
  // --- Demo user (group creator) ---
  const demoPage = await pageForUser('demo@doschei.local', 'password123');
  const groupsPage = new GroupsPage(demoPage);
  const groupSettingsPage = new GroupSettingsPage(demoPage);
  const groupDetailPage = new GroupDetailPage(demoPage);

  await demoPage.goto('/groups');
  const groupName = 'e2e-payer-default-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();

  // Invite Alice so she becomes a member (members[1]).
  await demoPage.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await acceptInvitationViaApi(demoPage, groupId, 'alice@doschei.local', 'password123');
  await demoPage.reload();
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // --- Alice user (invitee, current user for the discriminating assertion) ---
  const alicePage = await pageForUser('alice@doschei.local', 'password123');
  const aliceGroupDetailPage = new GroupDetailPage(alicePage);

  // Navigate to the routed Add-Expense page as Alice.
  await aliceGroupDetailPage.gotoAddExpense(groupId);
  await expect(alicePage).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));

  // CORE ASSERTION: Alice's "Paid by" chip should be preselected (carry the ring class).
  await aliceGroupDetailPage.expectPaidBySelected('Alice Rossi');

  // SYMMETRIC NEGATIVE CHECK: Demo User's chip must NOT carry the ring class.
  const demoFirstWord = 'Demo';
  const demoChip = alicePage
      .getByText('Paid by', { exact: true })
      .locator('..')
      .getByRole('button', { name: new RegExp(demoFirstWord) });
  const demoCls = (await demoChip.getAttribute('class')) ?? '';
  expect(demoCls.includes('ring-[#6554E7]'), `paid-by chip "Demo User" must NOT carry selection ring, got: ${demoCls}`).toBe(false);

  // --- Happy-path save to verify the form works end-to-end ---
  await aliceGroupDetailPage.fillDescription('Alice pays dinner');
  await aliceGroupDetailPage.fillAmount('12.34');
  // Idempotent — no-op if already selected (which it is, per the assertion above).
  await aliceGroupDetailPage.selectSplitMember('Alice Rossi');
  await aliceGroupDetailPage.saveExpense();

  // Back on group detail; assert the expense row appears with Alice as payer.
  await aliceGroupDetailPage.expectExpenseRowVisible({
    description: 'Alice pays dinner',
    amount: '12.34',
    paidByName: 'Alice Rossi',
  });
});
