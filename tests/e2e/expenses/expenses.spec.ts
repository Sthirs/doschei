// T6 of 7 — full expense lifecycle: create → edit every field → delete.
// Uses the authenticatedPage fixture (no UI login). One test, one group.
// The expense form is now a routed page at /groups/:id/expenses/new (create)
// and /groups/:id/expenses/:eid/edit (edit) — see ADR-0012.
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
  const groupId = await groupDetailPage.getGroupId();

  // Invite Alice so she's available as a "Paid by" option and split member.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // Navigate to the routed Add-Expense page.
  await groupDetailPage.gotoAddExpense(groupId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));

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
  // ExpenseFormView.vue:142-148 — submit navigates back to /groups/:id.
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  // 12. Assert the list row.
  await groupDetailPage.expectExpenseRowVisible({
    description: 'Dinner at Venice',
    amount: '42.50',
    paidByName: 'Alice Rossi',
  });

  // --- Look up the expense id from the API so we can target the edit
  //     route directly (no need to click the row + scrape the URL). ---
  const token = await page.evaluate(() => localStorage.getItem('doschei.auth.token'));
  const groupResponse = await page.request.get(`/api/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(groupResponse.status()).toBe(200);
  const groupJson = (await groupResponse.json()) as {
    group: { expenses: Array<{ id: string; description: string }> };
  };
  const dinnerExpense = groupJson.group.expenses.find(
    (e) => e.description === 'Dinner at Venice',
  );
  expect(dinnerExpense, 'expected the "Dinner at Venice" expense on the group').toBeDefined();
  const expenseId = dinnerExpense!.id;

  // --- EDIT step ---
  // 13. Navigate to the edit page.
  await groupDetailPage.gotoEditExpense(groupId, expenseId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/${expenseId}/edit$`));
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
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  // 20. Assert the list row now shows the edited values. Paid-by is intentionally
  // not editable (the edit form and PATCH endpoint omit paidByUserId), so it
  // stays 'Alice Rossi' from the create step.
  await groupDetailPage.expectExpenseRowVisible({
    description: 'Groceries for trip',
    amount: '20.00',
    paidByName: 'Alice Rossi',
  });

  // --- DELETE step ---
  // 22. Navigate to the edit page.
  await groupDetailPage.gotoEditExpense(groupId, expenseId);
  // 23. Delete: clicks Delete → confirm → waits for navigation.
  await groupDetailPage.deleteCurrentExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  // 24. Assert no expenses remain.
  await groupDetailPage.expectNoExpenses();
});
