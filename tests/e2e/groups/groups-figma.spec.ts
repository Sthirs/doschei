import { test, expect } from '../fixtures/auth';
import { GroupsPage } from '../pages';

test('groups list matches Figma design: thumbnails, avatars, balance chips', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);

  // 1. Login flow — authenticatedPage fixture handles this, so just navigate
  await page.goto('/groups');

  // 2. Wait for the groups list to load, then assert at least 3 seeded groups
  //    (test-created groups from concurrent specs may add to the count).
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 10000 });
  const headingCount = await page.getByRole('heading', { level: 2 }).count();
  expect(headingCount).toBeGreaterThanOrEqual(3);

  // 3. Weekend in Venice — GREEN "You are owed €..." (seeded demo net +40)
  await expect(page.getByRole('heading', { name: 'Weekend in Venice', level: 2 })).toBeVisible();
  // Balance chip: owed
  await expect(page.getByText(/You are owed €/)).toBeVisible();
  // Gradient thumbnail (no img)
  await expect(
    page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Weekend in Venice', level: 2 }) })
      .locator('div[aria-label*="thumbnail"]'),
  ).toBeVisible();

  // 4. Holiday in Palermo — CORAL "You owe €..." (seeded demo net -88)
  await expect(page.getByRole('heading', { name: 'Holiday in Palermo', level: 2 })).toBeVisible();
  await expect(page.getByText(/You owe €/)).toBeVisible();

  // 5. Personal Spending — GRAY "Settled" (demo solo, net 0)
  await expect(page.getByRole('heading', { name: 'Personal Spending', level: 2 })).toBeVisible();
  const personalCard = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Personal Spending', level: 2 }) });
  await expect(personalCard.getByText('Settled')).toBeVisible();

  // 6. Bottom button
  await expect(page.getByRole('button', { name: '+ Create group' })).toBeVisible();

  // 7. Office Lunch should NOT be visible (demo is not a member)
  await expect(page.getByRole('heading', { name: 'Office Lunch', level: 2 })).not.toBeVisible();

  // 8. Weekend in Venice has 2 member avatars (demo + alice)
  const veniceCard = page.locator('li').filter({
    has: page.getByRole('heading', { name: 'Weekend in Venice', level: 2 }),
  });
  // Read the member avatars via aria-labels — "Demo User" and "Alice Rossi" are the seed names
  await expect(veniceCard.getByLabel('Demo User')).toBeVisible(); // Demo User initial
  await expect(veniceCard.getByLabel('Alice Rossi')).toBeVisible(); // Alice Rossi initial

  // 9. Holiday in Palermo has 3 members (demo + alice + bob) — "+N" NOT shown since count = 3
  const palermoCard = page.locator('li').filter({
    has: page.getByRole('heading', { name: 'Holiday in Palermo', level: 2 }),
  });
  await expect(palermoCard.getByLabel('Demo User')).toBeVisible(); // Demo
  await expect(palermoCard.getByLabel('Alice Rossi')).toBeVisible(); // Alice
  await expect(palermoCard.getByLabel('Bob Bianchi')).toBeVisible(); // Bob Bianchi
  // No "+N" badge (3 members, max display = 3)
  await expect(palermoCard.locator('text=/^\\+\\d+$/')).not.toBeVisible();

  // 10. Click + Create group button reveals the form
  await page.getByRole('button', { name: '+ Create group' }).click();
  await expect(page.getByRole('textbox', { name: 'Group name' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
});
