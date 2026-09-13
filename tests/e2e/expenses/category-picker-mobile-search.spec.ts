// Regression test — mobile category search closed the picker instead of
// letting the user type.
//
// CategoryPicker.vue renders two DOM subtrees while open: a desktop popover
// (bound to useCategoryPicker's `panelRef`, hidden below the `sm` breakpoint)
// and a Teleport'd full-screen mobile sheet with its own search input. The
// composable's outside-click guard (useCategoryPicker.ts's onDocumentClick)
// only ever checked `triggerRef`/`panelRef`, so on a mobile viewport a real
// click anywhere inside the teleported sheet — including its own search
// input — was never recognised as "inside" and the document-level listener
// closed the picker before the click could focus the field.
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupDetailPage } from '../pages';

test.use({ viewport: { width: 390, height: 844 } });

test('category picker: tapping the search input on mobile keeps the sheet open', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  await groupsPage.openGroup('Weekend in Venice');
  const groupId = await groupDetailPage.getGroupId();

  await groupDetailPage.gotoAddExpense(groupId);
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/expenses/new$`));

  await groupDetailPage.openCategoryPicker();
  // The bug: this click used to be read as "outside" the picker and closed
  // it immediately, so the search field never even got a chance to focus.
  await groupDetailPage.clickCategorySearchInput();
  await groupDetailPage.expectCategoryPickerOpen();
  await expect(page.getByRole('textbox', { name: 'Search categories' })).toBeFocused();
});
