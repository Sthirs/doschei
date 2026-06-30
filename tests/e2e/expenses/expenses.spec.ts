// T6 of 7 — full expense lifecycle: create → edit every field → delete.
// Uses the authenticatedPage fixture (no UI login). One test, one group.
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage, GroupDetailPage } from '../pages';

test('expense lifecycle: create → edit every field → delete', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: create a uniquely-named group and invite Alice so she's a split member. ---
  await page.goto('/groups');
  const groupName = 'e2e-expense-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = page.url().split('/').pop();
  expect(groupId).toBeTruthy();

  // Invite Alice so she's available as a "Paid by" option and split member.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // Navigate back to the group detail page and open the Add Expense modal.
  await page.goto('/groups/' + groupId);
  await groupDetailPage.openAddExpense();

  // --- CREATE step ---
  // 5. Category: 'Dining Out' (label of dining-out — categories.ts:36). Distinct from default general.
  await groupDetailPage.setCategory('Dining Out');
  // 6. Description.
  await groupDetailPage.fillDescription('Dinner at Venice');
  // 7. Amount.
  await groupDetailPage.fillAmount('42.50');
  // 8. Paid by Alice Rossi.
  await groupDetailPage.setPaidBy('Alice Rossi');
  // 9. Split mode PERCENT (NOT equal — exercises the mode toggle).
  await groupDetailPage.setPercentSplit({ 'Demo User': 60, 'Alice Rossi': 40 });
  // 10. Date: non-today deterministic date.
  await groupDetailPage.setDate('2024-01-15');
  // 11. Save.
  await groupDetailPage.saveExpense();
  // 12. Assert the list row.
  await groupDetailPage.expectExpenseRowVisible({
    description: 'Dinner at Venice',
    amount: '42.50',
    paidByName: 'Alice Rossi',
  });

  // --- EDIT step ---
  // 13. Open the expense.
  await groupDetailPage.openExpense('Dinner at Venice');
  // 14. Edit category: 'Groceries' (label of groceries — categories.ts:37).
  await groupDetailPage.setCategory('Groceries');
  // 15. Edit description.
  await groupDetailPage.fillDescription('Groceries for trip');
  // 16. Edit amount.
  await groupDetailPage.fillAmount('20.00');
  // 17. Edit split mode to EQUAL (toggles from PERCENT → EQUAL).
  await groupDetailPage.setEqualSplit();
  // 18. Edit date.
  await groupDetailPage.setDate('2024-02-20');
  // 19. Save.
  await groupDetailPage.saveExpense();
  // 20. Assert the list row now shows the edited values. Paid-by is intentionally
  // not editable (the edit form and PATCH endpoint omit paidByUserId), so it
  // stays 'Alice Rossi' from the create step.
  await groupDetailPage.expectExpenseRowVisible({
    description: 'Groceries for trip',
    amount: '20.00',
    paidByName: 'Alice Rossi',
  });

  // --- DELETE step ---
  // 22. Open the expense.
  await groupDetailPage.openExpense('Groceries for trip');
  // 23. Delete: clicks Delete → confirm → waits for modal close.
  await groupDetailPage.deleteCurrentExpense();
  // 24. Assert no expenses remain.
  await groupDetailPage.expectNoExpenses();
});
