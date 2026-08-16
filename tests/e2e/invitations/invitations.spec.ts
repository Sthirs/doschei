// 2-user invitation lifecycle e2e (ADR-0014).
//
// Runs inside the single-worker chromium-only Playwright config
// (playwright.config.ts:6-9). Each test that needs two users spins up two
// browser contexts via the pageForUser factory fixture — NOT parallel workers.
//
// API contract (already live):
//   POST /api/groups/:id/members → 201 { invitation: { id, groupId, inviteeEmail,
//        status, createdAt } } (email-only — NO inviteeId, NO displayName — privacy
//        invariant per ADR-0014)
//   GET  /api/groups → { groups, invitations: [{ id, groupId, groupName,
//        inviterName, createdAt }] }
//   GET  /api/groups/:id → group with pendingInvitations: [{ id, email, createdAt }]
//        (email-only) + members (accepted only)
//   POST /api/groups/:id/invitations/:invitationId/accept → 200 { invitation }
//   POST /api/groups/:id/invitations/:invitationId/decline → 200 { invitation }
//   DELETE /api/groups/:id/invitations/:invitationId → 204
import { expect, test, registerUserViaApi, registerViaApi, uniqueValue } from '../fixtures/auth';
import { GroupsPage, GroupSettingsPage } from '../pages';

// ---------------------------------------------------------------------------
// happy path: invite a registered user → name hidden until accept
// ---------------------------------------------------------------------------
test('happy path: invite registered user → name hidden on settings until accept', async ({
  pageForUser,
}) => {
  // Register User A and User B via the API (unique emails).
  const accountA = await registerUserViaApi('inv-alpha');
  const accountB = await registerUserViaApi('inv-beta');

  // Get logged-in pages for A and B (two browser contexts, one worker).
  const pageA = await pageForUser(accountA.email, accountA.password);
  const pageB = await pageForUser(accountB.email, accountB.password);

  const groupsPageA = new GroupsPage(pageA);
  const settingsPageA = new GroupSettingsPage(pageA);
  const groupsPageB = new GroupsPage(pageB);

  // A creates a uniquely-named group via the UI.
  await pageA.goto('/groups');
  const groupName = 'e2e-inv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPageA.createGroup(groupName);
  await groupsPageA.expectGroupVisible(groupName);

  // A opens the group settings and captures the id from the URL.
  await groupsPageA.openGroup(groupName);
  const groupId = pageA.url().split('/').pop();
  expect(groupId).toBeTruthy();
  await pageA.goto('/groups/' + groupId + '/settings');

  // A invites B by email.
  // Capture the POST /members API response to assert the privacy invariant:
  // no inviteeId is exposed (ADR-0014), even when the invitee is a registered user.
  const inviteResponsePromise = pageA.waitForResponse(
    (res) => res.url().includes(`/api/groups/${groupId}/members`) && res.request().method() === 'POST',
  );
  await settingsPageA.inviteByEmail(accountB.email);
  const inviteResponse = await inviteResponsePromise;
  expect(inviteResponse.status()).toBe(201);
  const inviteJson = (await inviteResponse.json()) as {
    invitation: { inviteeEmail: string; status: string };
  };
  expect(inviteJson.invitation).not.toHaveProperty('inviteeId');

  // Invariant: B's email is visible in PENDING INVITATIONS, but B's displayName
  // is NOT visible anywhere on A's settings page (name-hidden until accept).
  await settingsPageA.expectPendingInvitationVisible(accountB.email);
  await settingsPageA.expectPendingInvitationNameHidden(accountB.displayName);
  await settingsPageA.expectMemberNotVisible(accountB.displayName);

  // B opens /groups and sees the invitation card with A's name as inviter.
  await pageB.goto('/groups');
  await expect(pageB.getByRole('heading', { name: 'Invitations', level: 2 })).toBeVisible();
  await groupsPageB.expectInvitationVisible(groupName, accountA.displayName);

  // B accepts via the UI.
  await groupsPageB.acceptInvitation(groupName);

  // The frontend auto-reloads (loadGroups); wait for the group to appear in the
  // regular groups list, then reload per the scenario and re-assert.
  await groupsPageB.expectGroupVisible(groupName);
  await pageB.reload();
  await groupsPageB.expectGroupVisible(groupName);
  await groupsPageB.expectInvitationsSectionHidden();

  // A reloads the settings page; B's displayName NOW appears in the members list
  // (the name only appears after acceptance).
  await pageA.reload();
  await settingsPageA.expectMemberVisible(accountB.displayName);
});

// ---------------------------------------------------------------------------
// deferred attach: invite an unregistered email → register → invitation appears
// ---------------------------------------------------------------------------
test('deferred attach: invite unregistered email → register → invitation appears', async ({
  pageForUser,
}) => {
  const accountA = await registerUserViaApi('def-alpha');
  const pageA = await pageForUser(accountA.email, accountA.password);

  const groupsPageA = new GroupsPage(pageA);
  const settingsPageA = new GroupSettingsPage(pageA);

  // A creates a group.
  await pageA.goto('/groups');
  const groupName = 'e2e-def-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPageA.createGroup(groupName);
  await groupsPageA.openGroup(groupName);
  const groupId = pageA.url().split('/').pop();
  expect(groupId).toBeTruthy();
  await pageA.goto('/groups/' + groupId + '/settings');

  // A invites an unregistered email.
  const unregisteredEmail = `${uniqueValue('e2e-deferred')}@doschei.local`;

  // Capture the POST /members API response to assert the privacy invariant:
  // no inviteeId is exposed (deferred attach — no registered user matches yet).
  const inviteResponsePromise = pageA.waitForResponse(
    (res) => res.url().includes(`/api/groups/${groupId}/members`) && res.request().method() === 'POST',
  );
  await settingsPageA.inviteByEmail(unregisteredEmail);
  const inviteResponse = await inviteResponsePromise;
  expect(inviteResponse.status()).toBe(201);
  const inviteJson = (await inviteResponse.json()) as {
    invitation: { inviteeEmail: string; status: string };
  };
  expect(inviteJson.invitation).not.toHaveProperty('inviteeId');
  expect(inviteJson.invitation.inviteeEmail).toBe(unregisteredEmail);
  expect(inviteJson.invitation.status).toBe('pending');

  // The pending invitation also appears on A's settings page (email-only).
  await settingsPageA.expectPendingInvitationVisible(unregisteredEmail);

  // Register the previously-unregistered email.
  await registerViaApi(unregisteredEmail, 'password123', 'Deferred User');

  // The new user opens /groups and sees the invitation (attach hook ran).
  const pageNew = await pageForUser(unregisteredEmail, 'password123');
  await pageNew.goto('/groups');
  const groupsPageNew = new GroupsPage(pageNew);
  await expect(pageNew.getByRole('heading', { name: 'Invitations', level: 2 })).toBeVisible();
  await groupsPageNew.expectInvitationVisible(groupName, accountA.displayName);
});

// ---------------------------------------------------------------------------
// decline flow: invitee declines → name never appears in inviter's members
// ---------------------------------------------------------------------------
test('decline: invitee declines → name never appears in members', async ({ pageForUser }) => {
  const accountA = await registerUserViaApi('dec-alpha');
  const accountB = await registerUserViaApi('dec-beta');

  const pageA = await pageForUser(accountA.email, accountA.password);
  const pageB = await pageForUser(accountB.email, accountB.password);

  const groupsPageA = new GroupsPage(pageA);
  const settingsPageA = new GroupSettingsPage(pageA);
  const groupsPageB = new GroupsPage(pageB);

  // A creates a group and invites B.
  await pageA.goto('/groups');
  const groupName = 'e2e-dec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await groupsPageA.createGroup(groupName);
  await groupsPageA.openGroup(groupName);
  const groupId = pageA.url().split('/').pop();
  expect(groupId).toBeTruthy();
  await pageA.goto('/groups/' + groupId + '/settings');

  await settingsPageA.inviteByEmail(accountB.email);
  await settingsPageA.expectPendingInvitationVisible(accountB.email);
  await settingsPageA.expectPendingInvitationNameHidden(accountB.displayName);

  // B declines via the UI.
  await pageB.goto('/groups');
  await groupsPageB.expectInvitationVisible(groupName, accountA.displayName);
  await groupsPageB.declineInvitation(groupName);

  // The frontend auto-reloads; the Invitations section vanishes.
  await groupsPageB.expectInvitationsSectionHidden();

  // A reloads the settings page; B's name NEVER appears in members.
  await pageA.reload();
  await settingsPageA.expectMemberNotVisible(accountB.displayName);
});

// ---------------------------------------------------------------------------
// empty state: a user with no invitations sees no Invitations section
// ---------------------------------------------------------------------------
test('empty state: user with no invitations sees no Invitations section', async ({ pageForUser }) => {
  const user = await registerUserViaApi('empty');
  const page = await pageForUser(user.email, user.password);

  await page.goto('/groups');
  const groupsPage = new GroupsPage(page);
  await groupsPage.expectInvitationsSectionHidden();
});
