// Regression test for the amount-field autofocus bug.
//
// WHY THIS TEST DISCRIMINATES OLD VS NEW BEHAVIOR:
// A bare `autofocus` attribute relies on the HTML "autofocus processed flag",
// which lives on the DOCUMENT and is set the first time any autofocus
// candidate is honored. Because this is an SPA, the document is never
// recreated between navigations, so a `page.goto()` to the form always looks
// like "the first time" — that would make this test pass even with the bug
// still present. To actually exercise the flag, this test opens the form a
// SECOND time via pure client-side (`router.push`) navigation: leaving via
// the topbar back button, then re-entering via the in-app "+ Add expense"
// button. Neither of those triggers a document reload (see the page-object
// methods `clickBackToGroup` / `clickAddExpense`), so only a real per-mount
// `.focus()` call (not the `autofocus` attribute) can pass this assertion.
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupDetailPage } from '../pages';

test('amount field is focused every time the add-expense form is opened, including a second time in the same session', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-amount-autofocus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();

  // --- First open: a full navigation (page.goto) is fine here — the bug
  // only manifests on a SECOND mount within the same document. ---
  await groupDetailPage.gotoAddExpense(groupId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));
  await groupDetailPage.expectAmountFocused();

  // --- Leave the form via the topbar back button: `router.push`, NOT a
  // document reload. ---
  await groupDetailPage.clickBackToGroup();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  // --- Re-enter via the in-app "+ Add expense" button: also `router.push`,
  // NOT `page.goto`. The document (and its autofocus-processed flag) is the
  // SAME one as the first open. ---
  await groupDetailPage.clickAddExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));

  // CORE ASSERTION: without the fix (bare `autofocus` attribute), this fails
  // because the document already "used up" its one autofocus candidate on
  // the first open above.
  await groupDetailPage.expectAmountFocused();
});

// Regression test for over-eager autofocus: AmountField must only focus
// itself when creating a NEW expense (ExpenseFormView.vue passes
// `:autofocus="mode === 'create'"`). In edit mode the field must stay
// unfocused so opening an existing expense to review it does not pop the
// mobile keyboard.
//
// WHY `gotoEditExpense` (a `page.goto`) IS THE STRICTER CASE HERE:
// a full navigation gives the document a fresh, unused autofocus-processed
// flag. If AmountField were still calling `.focus()` unconditionally in
// edit mode, this is exactly the scenario where it WOULD succeed — so this
// is a stronger check than reaching the edit form via client-side nav.
test('amount field is NOT focused when opening an existing expense in edit mode', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  const groupName = 'e2e-amount-autofocus-edit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);
  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();

  // Create an expense to edit. Description + amount are the only fields
  // required for a valid submit (paidBy and split already default sensibly
  // — see useExpenseFormValidation / useExpenseSplit).
  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.fillDescription('Autofocus edit-mode check');
  await groupDetailPage.fillAmount('12.34');
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));

  const token = await page.evaluate(() => localStorage.getItem('doschei.auth.token'));
  const groupResponse = await page.request.get(`/api/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(groupResponse.status()).toBe(200);
  const groupJson = (await groupResponse.json()) as {
    group: { expenses: Array<{ id: string; description: string }> };
  };
  const createdExpense = groupJson.group.expenses.find(
    (e) => e.description === 'Autofocus edit-mode check',
  );
  expect(createdExpense, 'expected the created expense on the group').toBeDefined();

  await groupDetailPage.gotoEditExpense(groupId, createdExpense!.id);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/${createdExpense!.id}/edit$`));

  // Wait for the loaded value before checking focus — see
  // expectAmountNotFocusedAfterLoad's comment for why an un-gated
  // `not.toBeFocused()` here would be false-confidence (it could pass while
  // the form is still in its `expenseForm.loading` state, before AmountField
  // even mounts).
  await groupDetailPage.expectAmountNotFocusedAfterLoad('12.34');
});
