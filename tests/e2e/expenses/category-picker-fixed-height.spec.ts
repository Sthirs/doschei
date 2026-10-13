// The mobile category sheet keeps a fixed height while searching: filtering
// removes non-matching categories and the matches move up under the search
// field, instead of the bottom-anchored sheet shrinking and its top edge
// sliding down.
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupDetailPage } from '../pages';

test.use({ viewport: { width: 390, height: 844 } });

test('category picker: searching on mobile keeps the sheet height and lifts matches to the top', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  await page.goto('/groups');
  await groupsPage.openGroup('Weekend in Venice');
  const groupId = await groupDetailPage.getGroupId();

  await groupDetailPage.gotoAddExpense(groupId);
  await groupDetailPage.openCategoryPicker();

  const dialog = page.getByRole('dialog', { name: 'Select category' });
  const searchInput = dialog.getByRole('textbox', { name: 'Search categories' });
  // Measure only once the sheet's slide-in transition (BottomSheet.vue) has
  // settled, or the "before" box catches it mid-flight.
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const before = await dialog.boundingBox();
  expect(before).not.toBeNull();

  await searchInput.fill('Groceries');
  const match = dialog.getByRole('button', { name: 'Groceries' });
  await expect(match).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Rent' })).toHaveCount(0);

  const after = await dialog.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.height).toBeCloseTo(before!.height, 0);
  expect(after!.y).toBeCloseTo(before!.y, 0);

  // The match sits right under the search field, not at the bottom of the sheet.
  const inputBox = await searchInput.boundingBox();
  const matchBox = await match.boundingBox();
  expect(matchBox!.y - (inputBox!.y + inputBox!.height)).toBeLessThan(80);
});
