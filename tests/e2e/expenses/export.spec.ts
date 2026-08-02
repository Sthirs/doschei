// Happy path for the group-month CSV export: create a group, invite Alice so
// two split members exist, add one expense in a fixed past month, trigger
// the export, and assert the downloaded file's name + body. Uses the
// authenticatedPage fixture (no UI login).
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage, GroupDetailPage } from '../pages';

test('export a group month as CSV', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);
  const groupDetailPage = new GroupDetailPage(page);

  // --- Setup: unique group so we don't collide with parallel runs. ---
  await page.goto('/groups');
  const groupName = 'e2e-export-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  await groupsPage.openGroup(groupName);
  const groupId = page.url().split('/').pop();
  expect(groupId).toBeTruthy();

  // Invite Alice so the CSV header has two member columns.
  await page.goto('/groups/' + groupId + '/settings');
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // --- Add one expense in a fixed past month. ---
  await page.goto('/groups/' + groupId);
  await groupDetailPage.openAddExpense();
  await groupDetailPage.setCategory('Dining Out');
  await groupDetailPage.fillDescription('Ski pass');
  await groupDetailPage.fillAmount('60.00');
  await groupDetailPage.setPaidBy('Alice Rossi');
  await groupDetailPage.setEqualSplit();
  await groupDetailPage.setDate('2024-03-15');
  await groupDetailPage.saveExpense();

  // --- Trigger export and capture the download. ---
  await groupDetailPage.setExportMonth('2024-03');
  const { filename, text } = await groupDetailPage.clickExportAndExpectDownload();

  // --- Filename: <sanitizedGroupName>-YYYY-MM-DD.csv ---
  // Mirror the backend's `sanitizeLatin1Filename` strip semantics: spaces become
  // `-`, then anything outside [A-Za-z0-9._-] is removed.
  const sanitized = groupName.replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
  expect(filename.startsWith(sanitized + '-')).toBe(true);
  expect(filename.endsWith('.csv')).toBe(true);

  // --- Body: header + one data row for the expense we just added. ---
  const lines = text.split('\r\n').filter(Boolean);
  // First line: fixed CSV header (groupService.ts / csvExport.ts).
  expect(lines[0]).toMatch(/^date,description,category,expense,currency/);
  // Member columns are sorted ascending: "Alice Rossi" before "Demo User".
  expect(lines[0]).toContain('Alice Rossi');
  expect(lines[0]).toContain('Demo User');
  const aliceIdx = lines[0].indexOf('Alice Rossi');
  const demoIdx = lines[0].indexOf('Demo User');
  expect(aliceIdx).toBeLessThan(demoIdx);

  // Row contents: Ski pass / 60.00 / EUR; Alice paid 60 and owes 30 → net +30.00;
  // Demo owes 30 and paid 0 → net -30.00.
  expect(text).toContain('Ski pass');
  expect(text).toContain('60.00');
  expect(text).toContain('EUR');
  expect(text).toContain('-30.00');
  expect(text).toContain('30.00');
});
