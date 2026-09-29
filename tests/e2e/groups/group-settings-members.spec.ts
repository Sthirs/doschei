// Group settings flows that had no coverage at any level: removing a member and
// cancelling a pending invitation from the settings panel (the buttons in
// GroupSettingsPanel.vue), and a member's profile picture being shown to the
// other members of their group (docs/specifications.md §Features: "A member's
// profile picture, when set, is shown to other members of their groups").
//
// Groups are built over the API with fresh users so the shared demo user's
// groups list is never touched.
import { expect, test } from '../fixtures/auth';
import {
  createGroupViaApi,
  inviteViaApi,
  registerNamedUser,
  uploadAvatarViaApi,
} from '../fixtures/groups';
import { GroupDetailPage, GroupSettingsPage, GroupsPage } from '../pages';

test('remove a member from the settings panel: they leave the list and lose access to the group', async ({
  pageForUser,
}) => {
  const owner = await registerNamedUser('Olga');
  const member = await registerNamedUser('Mira');
  const group = await createGroupViaApi(owner, [member], 'e2e-remove');

  const ownerPage = await pageForUser(owner.email, owner.password);
  const settingsPage = new GroupSettingsPage(ownerPage);
  await ownerPage.goto(`/groups/${group.id}/settings`);
  await settingsPage.expectMemberVisible(member.displayName);

  await settingsPage.removeMember(member.email);

  await settingsPage.expectMemberRowGone(member.email);
  await ownerPage.reload();
  await settingsPage.expectMemberRowGone(member.email);

  // The removed member no longer sees the group, and a deep link is refused.
  const memberPage = await pageForUser(member.email, member.password);
  await memberPage.goto('/groups');
  await new GroupsPage(memberPage).expectGroupNotVisible(group.name);
  await memberPage.goto(`/groups/${group.id}`);
  await expect(memberPage.getByText('We could not load this group.')).toBeVisible();
});

test('cancel a pending invitation from the settings panel: it disappears for inviter and invitee', async ({
  pageForUser,
}) => {
  const owner = await registerNamedUser('Olga');
  const invitee = await registerNamedUser('Ivan');
  const group = await createGroupViaApi(owner, [], 'e2e-cancel-invite');
  await inviteViaApi(owner, group.id, invitee.email);

  // The invitee can see the invitation before it is cancelled.
  const inviteePage = await pageForUser(invitee.email, invitee.password);
  const inviteeGroupsPage = new GroupsPage(inviteePage);
  await inviteePage.goto('/groups');
  await inviteeGroupsPage.expectInvitationVisible(group.name, owner.displayName);

  const ownerPage = await pageForUser(owner.email, owner.password);
  const settingsPage = new GroupSettingsPage(ownerPage);
  await ownerPage.goto(`/groups/${group.id}/settings`);
  await settingsPage.expectPendingInvitationVisible(invitee.email);

  await settingsPage.cancelInvitationViaUi(invitee.email);

  await settingsPage.expectPendingInvitationsSectionHidden();
  await ownerPage.reload();
  await settingsPage.expectPendingInvitationsSectionHidden();

  await inviteePage.reload();
  await inviteeGroupsPage.expectInvitationsSectionHidden();
  await inviteeGroupsPage.expectGroupNotVisible(group.name);
});

test("another member's profile picture is shown in the member list and the expense form", async ({
  pageForUser,
}) => {
  const owner = await registerNamedUser('Olga');
  const member = await registerNamedUser('Pia');
  const group = await createGroupViaApi(owner, [member], 'e2e-member-avatar');
  const memberImageUrl = await uploadAvatarViaApi(member);

  const ownerPage = await pageForUser(owner.email, owner.password);

  await ownerPage.goto(`/groups/${group.id}/settings`);
  await new GroupSettingsPage(ownerPage).expectMemberAvatarImage(member.email, memberImageUrl);

  // Payer and split chips on the add-expense form carry the same picture.
  await new GroupDetailPage(ownerPage).gotoAddExpense(group.id);
  const firstName = member.displayName.split(' ')[0];
  for (const section of ['paid-by-section', 'split-with-section']) {
    const chip = ownerPage.getByTestId(section).getByRole('button', { name: new RegExp(firstName) });
    await expect(chip.locator('img')).toHaveAttribute('src', memberImageUrl);
  }
});
