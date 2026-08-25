// DateTimePicker bottom-sheet e2e:
// open, navigate, select+apply, cancel reverts, selected cell highlight.
// Uses the authenticatedPage fixture (no UI login). One test, five scenarios
// (happy-A through happy-E) — they share state sequentially (happy-D depends
// on the date committed in happy-C), matching the single-test pattern from
// expenses.spec.ts.
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage, GroupDetailPage, acceptInvitationViaApi } from '../pages';

const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

// Convert a "MMMM YYYY" title to a comparable month index (year*12+month).
// Used to verify next/prev navigation changes the month by exactly one step.
function titleToIndex(title: string): number {
  const m = /^(\w+)\s+(\d{4})$/.exec(title.trim());
  if (!m) return Number.NaN;
  return parseInt(m[2], 10) * 12 + monthNames.indexOf(m[1]);
}

// Format a YYYY-MM-DD date the same way DateTimePicker.vue:36-44 does
// (toLocaleDateString 'en-US' weekday:short, month:short, day:numeric →
// "ddd, MMM D" e.g. "Mon, Aug 10").
function formatTriggerDate(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

test('DateTimePicker bottom-sheet: open, navigate, select+apply, cancel reverts, highlight', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: create a uniquely-named group and invite Alice so she's a split member. ---
  await page.goto('/groups');
  const groupName = 'e2e-picker-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = await groupDetailPage.getGroupId();

  // Invite Alice so she's available as a "Paid by" option and split member.
  // Under the invitation system (ADR-0014) Alice is only invited until she accepts,
  // so the accept step is performed via the API helper before she appears as a member.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await acceptInvitationViaApi(page, groupId, 'alice@doschei.local', 'password123');
  await page.reload();
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // Navigate to the routed Add-Expense page (ADR-0012).
  await groupDetailPage.gotoAddExpense(groupId);

  // --- happy-A: Open ---
  // DateTimePicker.vue:64-113 — the trigger has data-test-id="dtp" and
  // contains exactly two SVGs: a calendar glyph (line 78-92) and a
  // chevron-down (line 97-111). Assert the icon count up-front so any
  // accidental re-ordering or removal of an icon is caught here, not at
  // the Apply step.
  const trigger = page.locator('[data-test-id="dtp"]');
  await expect(trigger).toBeVisible();
  const svgIcons = trigger.locator('svg');
  await expect(svgIcons).toHaveCount(2);
  await trigger.click();

  // DateTimePicker.vue:115-120 — dialog role="dialog" aria-label="Select date".
  const dialog = page.getByRole('dialog', { name: 'Select date' });
  await expect(dialog).toBeVisible();

  // Weekday header row — v-calendar renders .vc-weekday cells with single
  // uppercase letters. With first-day-of-week=1 (Mon-first, DateTimePicker
  // .vue:114) the row is M T W T F S S (7 cells). Assert there are 7 cells
  // and each of S, M, T, W, F appears at least once.
  const weekdays = dialog.locator('.vc-weekday');
  await expect(weekdays).toHaveCount(7);
  for (const letter of ['S', 'M', 'T', 'W', 'F']) {
    await expect(weekdays.filter({ hasText: letter }).first()).toBeVisible();
  }

  // Scrim — DateTimePicker.vue:72 — backdrop div with backdrop-blur-[2px].
  // Assert the scrim (backdrop blur) is visible.
  const scrim = dialog.locator('[class*="backdrop-blur"]');
  await expect(scrim).toBeVisible();

  // --- happy-B: Navigate ---
  // .vc-title renders "MMMM YYYY" (DateTimePicker.vue:115 masks.title).
  const titleEl = dialog.locator('.vc-header .vc-title').first();
  const originalTitle = (await titleEl.textContent()) ?? '';
  expect(originalTitle.trim()).toMatch(/^\w+ \d{4}$/);

  // Click next month — .vc-arrow.vc-next (v-calendar index.js:6374).
  await dialog.locator('.vc-arrow.vc-next').click();
  // Wait for the title text to actually change (not just 100ms arbitrary delay).
  await expect(titleEl).not.toHaveText(originalTitle.trim(), { timeout: 3000 });
  const nextTitle = (await titleEl.textContent()) ?? '';
  expect(titleToIndex(nextTitle)).toBe(titleToIndex(originalTitle) + 1);

  // Click previous month — .vc-arrow.vc-prev (v-calendar index.js:6328).
  await dialog.locator('.vc-arrow.vc-prev').click();
  await expect(titleEl).toHaveText(originalTitle.trim(), { timeout: 3000 });
  const backTitle = (await titleEl.textContent()) ?? '';
  expect(backTitle.trim()).toBe(originalTitle.trim());

  // --- happy-C: Select + Apply ---
  // Navigate to a visible day cell in the current month — the 10th (always
  // in-month). Scope to .vc-day:not(.is-not-in-month) so adjacent-month days
  // with the same number are not matched.
  await dialog
      .locator('.vc-day:not(.is-not-in-month) .vc-day-content')
      .filter({ hasText: /^10$/ })
      .first()
      .click();

  // Compute the expected trigger date string from the current month title.
  const titleMatch = /^(\w+)\s+(\d{4})$/.exec(originalTitle.trim());
  expect(titleMatch).toBeTruthy();
  const selectedYear = parseInt(titleMatch![2], 10);
  const selectedMonth = monthNames.indexOf(titleMatch![1]) + 1;
  const selectedDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-10`;
  const expectedTriggerText = formatTriggerDate(selectedDateStr);

  // Click Apply — DateTimePicker.vue:129-135.
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });

  // The trigger text now reflects the selected date (ddd, MMM D).
  await expect(trigger.getByText(expectedTriggerText, { exact: true })).toBeVisible();

  // --- happy-D: Cancel reverts ---
  // The trigger should still show the date from happy-C.
  await expect(trigger.getByText(expectedTriggerText, { exact: true })).toBeVisible();

  // Open the picker again.
  await trigger.click();
  await expect(dialog).toBeVisible();

  // Navigate to a different month.
  await dialog.locator('.vc-arrow.vc-next').click();
  await expect(titleEl).not.toHaveText(originalTitle.trim(), { timeout: 3000 });
  const differentTitle = (await titleEl.textContent()) ?? '';
  expect(differentTitle.trim()).not.toBe(originalTitle.trim());

  // Click Cancel — DateTimePicker.vue:122-128.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });

  // The trigger STILL shows the previously-committed date (unchanged — Cancel
  // discarded the navigation).
  await expect(trigger.getByText(expectedTriggerText, { exact: true })).toBeVisible();

  // --- happy-E: Selected cell highlight ---
  // Open the picker.
  await trigger.click();
  await expect(dialog).toBeVisible();

  // Select a day (click it) — the 15th (always in-month).
  await dialog
      .locator('.vc-day:not(.is-not-in-month) .vc-day-content')
      .filter({ hasText: /^15$/ })
      .first()
      .click();
  await page.waitForTimeout(100); // wait for v-calendar to render the highlight

  // Inspect the .vc-highlight element — it should exist after selecting a day.
  // DateTimePicker.vue:175-179 — :deep(.vc-highlight) sets background:#6554e7.
  const highlight = dialog.locator('.vc-highlight');
  await expect(highlight).toHaveCount(1, { timeout: 5000 });

  // Assert it has a background color (computed style) — the presence of the
  // highlight element proves the visual selection state renders.
  const bg = await highlight.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(bg).toBeTruthy();
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('transparent');
});
