// No delete-group step: backend has no DELETE /api/groups/:id (decision A2).
import { test, expect } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage } from '../pages';

test('group lifecycle: create → invite Alice → rename', async ({ authenticatedPage: page }) => {
  const groupsPage = new GroupsPage(page);
  const groupSettingsPage = new GroupSettingsPage(page);

  // 1. Navigate to /groups.
  await page.goto('/groups');

  // 2. Unique group name pattern (same as apps/backend/tests/integration/helpers/api.ts:59 uniqueValue).
  const groupName = 'e2e-group-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  // 3-4. Create the group and assert it appears in the list.
  await groupsPage.createGroup(groupName);
  await groupsPage.expectGroupVisible(groupName);

  // 5. Open the group detail, capture the id from the URL, then jump to settings via URL
  //    (not by clicking the Settings button — too fragile across mobile/desktop layouts).
  await groupsPage.openGroup(groupName);
  const groupId = page.url().split('/').pop();
  expect(groupId).toBeTruthy();
  await page.goto('/groups/' + groupId + '/settings');

  // 6-7. Invite Alice by email and assert her display name appears in the member list
  //      (Alice Rossi is from seedService.ts:19).
  await groupSettingsPage.inviteByEmail('alice@doschei.local');
  await groupSettingsPage.expectMemberVisible('Alice Rossi');

  // 8. Rename the group.
  await groupSettingsPage.rename(groupName + '-renamed');

  // 9-10. Reload the settings page and assert the name input contains the new name
  //       (confirms PATCH persisted).
  await page.goto('/groups/' + groupId + '/settings');
  await expect(page.getByLabel('Group Name')).toHaveValue(groupName + '-renamed');
});
