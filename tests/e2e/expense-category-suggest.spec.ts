// T7 — happy path for the CategoryPicker search + description-driven
// auto-selection feature.
//
// Demo user (demo@doschei.local / password123) opens the seeded
// 'Weekend in Venice' group (seedService.ts:32) where 'Venice train tickets'
// is already a category=bus-train expense (seedService.ts:54-63), then walks
// the full picker+search+auto-suggest happy path on the routed Add-Expense
// page (ADR-0012 — /groups/:id/expenses/new). The created expense is deleted
// at the end so the seed group is not left polluted for re-runs.
import { test, expect } from './fixtures/auth';
import { GroupsPage, GroupDetailPage } from './pages';

test('category picker: search and description-driven auto-selection', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Open the seeded 'Weekend in Venice' group. ---
  await page.goto('/groups');
  await groupsPage.openGroup('Weekend in Venice');
  const groupId = await groupDetailPage.getGroupId();

  // --- Navigate to the routed Add-Expense page. ---
  await groupDetailPage.gotoAddExpense(groupId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));

  // --- 1. Default category is 'General' (DEFAULT_CATEGORY_KEY, categories.ts:98). ---
  await groupDetailPage.expectCategoryLabel('General');

  // --- 2. Description-driven auto-selection. ---
  // ExpenseFormView.vue:434-445 — the description input fires @input →
  // scheduleSuggestion() which sets a 300ms debounce before applySuggestion()
  // (ExpenseFormView.vue:102-122). The engine learns from the group's prior
  // expenses (categorySuggest.ts), and 'Venice train tickets' is an exact
  // match (1 hit, category=bus-train) so the trigger flips to 'Bus/Train'.
  // The 1000ms expect.poll ceiling comfortably covers debounce + render.
  await groupDetailPage.fillDescription('Venice train tickets');
  await groupDetailPage.expectCategoryLabelEventually('Bus/Train');

  // --- 3. Free-text search picks 'Groceries'. ---
  // CategoryPicker.vue:79-87 — Enter on the search input with a non-empty
  // query calls select(filteredGroups[0].entries[0].key), which emits
  // update:modelValue and closes the picker. 'groce' only matches
  // 'Groceries' (categories.ts:49) so the first entry is unambiguous.
  await groupDetailPage.searchAndPickCategory('groce');
  await groupDetailPage.expectCategoryLabel('Groceries');

  // --- 4. Guard: a manual pick survives a description that would otherwise
  //        re-trigger the suggestion engine. ---
  // ExpenseFormView.vue:98-100, :430-433 — picking a category (via search or
  // grid) fires onCategoryPicked() → categoryTouched=true; applySuggestion()
  // returns early on that flag, so the engine can never overwrite a
  // deliberate choice. 'dining' is the substring that selects 'Dining Out'
  // (categories.ts:48) — note the picker search is a plain substring match
  // (CategoryPicker.vue:36-39), not fuzzy, so 'dinner' would match nothing.
  await groupDetailPage.searchAndPickCategory('dining');
  await groupDetailPage.expectCategoryLabel('Dining Out');
  await groupDetailPage.fillDescription('Venice train tickets');
  // Wait past the 300ms debounce + render so the suggestion engine has had a
  // chance to run — the label must NOT change.
  await page.waitForTimeout(1000);
  await groupDetailPage.expectCategoryLabel('Dining Out');

  // --- 5. Submit and verify the row lands on the group detail. ---
  await groupDetailPage.fillAmount('10.00');
  // Paid-by defaults to the first group member (ExpenseFormView.vue:177), but
  // the members array order from the DB join is not contractual — pin it to
  // Demo User so the assertion below is deterministic.
  await groupDetailPage.setPaidBy('Demo User');
  await groupDetailPage.saveExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  // The seeded 'Venice train tickets' (€50.00) shares the new row's
  // description, so expectExpenseRowVisible's description-first locator would
  // be ambiguous. Scope by the unique €10.00 amount cell (GroupDetailView.vue
  // renders each expense as an <li>) and assert description + payer within it.
  const newRow = page.locator('li', { has: page.getByText('\u20AC10.00', { exact: true }) });
  await expect(newRow.getByText('Venice train tickets', { exact: true })).toBeVisible();
  await expect(newRow.getByText('Paid by Demo User', { exact: true })).toBeVisible();

  // --- 6. Cleanup: delete the created expense so the seed group is not left
  //        polluted for re-runs. Look the expense up by description + amount
  //        to disambiguate from the seeded €50.00 entry that shares the
  //        description (amount serialised as a Number — groupService.ts:114). ---
  const token = await page.evaluate(() => localStorage.getItem('doschei.auth.token'));
  const groupResponse = await page.request.get(`/api/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(groupResponse.status()).toBe(200);
  const groupJson = (await groupResponse.json()) as {
    group: { expenses: Array<{ id: string; description: string; amount: number }> };
  };
  const createdExpense = groupJson.group.expenses.find(
    (e) => e.description === 'Venice train tickets' && e.amount === 10.0,
  );
  expect(createdExpense, 'cleanup: expected the just-created €10.00 expense on the group').toBeDefined();
  await groupDetailPage.gotoEditExpense(groupId, createdExpense!.id);
  await groupDetailPage.deleteCurrentExpense();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
});
