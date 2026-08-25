import { expect, type Page } from '@playwright/test';

export class GroupsPage {
  private createGroupButton = this.page.getByRole('button', { name: '+ Create group' });
  private groupNameInput = this.page.getByRole('textbox', { name: 'Group name' });
  private createButton = this.page.getByRole('button', { name: 'Create', exact: true });
  private cancelButton = this.page.getByRole('button', { name: 'Cancel' });

  constructor(private page: Page) {}

  async clickCreateGroupButton() {
    await this.createGroupButton.click();
  }

  async createGroup(name: string) {
    await this.clickCreateGroupButton();
    await this.groupNameInput.fill(name);
    await this.createButton.click();
  }

  async openGroup(name: string) {
    // GroupsView.vue:79-109 — list items are <li> with <h2>{{group.name}}</h2>.
    // Click navigates via router.push({ name: 'group-detail', params: { id: group.id } }).
    await this.page.getByRole('heading', { name, level: 2 }).click();
    await this.page.waitForURL(/\/groups\/[a-f0-9-]+$/);
  }

  async expectGroupVisible(name: string) {
    await expect(this.page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }

  async expectGroupNotVisible(name: string) {
    await expect(this.page.getByRole('heading', { name, level: 2 })).not.toBeVisible();
  }

  // -- New: UI-aligned selectors (for T6 e2e) --

  async expectBalanceChip(name: string, chipText: string) {
    // Find the group card containing name, then the balance chip within it
    const groupCard = this.page.locator('li', { has: this.page.getByRole('heading', { name, level: 2 }) });
    await expect(
      groupCard.locator('.space-y-3\\:last-child, p').filter({ hasText: /You are owed|You owe|Settled/ }),
    ).toContainText(chipText);
  }

  async expectGradientThumbnail(name: string) {
    const groupCard = this.page.locator('li', { has: this.page.getByRole('heading', { name, level: 2 }) });
    // The thumbnail is a gradient div (no <img>) when imageUrl is null
    await expect(groupCard.locator('div[aria-label*="thumbnail"]')).toBeVisible();
    await expect(groupCard.locator('img').first()).not.toBeVisible();
  }

  async expectMemberAvatars(name: string, count: number, overflowBadge?: string) {
    const groupCard = this.page.locator('li', { has: this.page.getByRole('heading', { name, level: 2 }) });
    const avatarDivs = groupCard.locator('.flex.items-center.-space-x-2 > div');
    await expect(avatarDivs.first()).toBeVisible();
    if (overflowBadge) {
      await expect(groupCard.getByText(overflowBadge)).toBeVisible();
    }
  }

  async expectCreateGroupButton() {
    await expect(this.page.getByRole('button', { name: '+ Create group' })).toBeVisible();
  }

  // -- Invitation selectors (GroupsView.vue:142-202) --

  /**
   * The invitation card is an <li> inside the Invitations <section>. Each card
   * contains an <h3> with the group name (GroupsView.vue:169-174), a subtitle
   * "Invited by {inviterName}" (GroupsView.vue:175-177), and Accept/Decline
   * buttons (GroupsView.vue:182-197). The groups list uses <h2> (level 2) for
   * group names, so scoping to level-3 headings uniquely identifies invitation
   * cards.
   */
  private invitationCard(groupName: string) {
    return this.page.locator('li', {
      has: this.page.getByRole('heading', { name: groupName, level: 3 }),
    });
  }

  async expectInvitationVisible(groupName: string, invitedByName: string) {
    const card = this.invitationCard(groupName);
    await expect(card).toBeVisible();
    // GroupsView.vue:175-177 — <p>Invited by {{ invitation.inviterName }}</p>
    await expect(card.getByText(`Invited by ${invitedByName}`, { exact: true })).toBeVisible();
  }

  async acceptInvitation(groupName: string) {
    const card = this.invitationCard(groupName);
    // GroupsView.vue:182-189 — primary Accept button.
    await card.getByRole('button', { name: 'Accept' }).click();
  }

  async declineInvitation(groupName: string) {
    const card = this.invitationCard(groupName);
    // GroupsView.vue:190-197 — outlined Decline button.
    await card.getByRole('button', { name: 'Decline' }).click();
  }

  async expectInvitationsSectionHidden() {
    // GroupsView.vue:147-151 — <h2>Invitations</h2> only renders when
    // invitations.length > 0 (v-if on the <section>).
    await expect(this.page.getByRole('heading', { name: 'Invitations', level: 2 })).not.toBeVisible();
  }
}

// ---------------------------------------------------------------------------
// API-only invitation accept helper.
//
// Used by the migrated legacy specs (groups.spec.ts, expenses.spec.ts) so the
// seeded invitee (alice@doschei.local / password123) accepts her own pending
// invitation via the API — no second browser context is needed. The helper
// logs the invitee in via POST /api/auth/login, lists her pending invitations
// via GET /api/groups, finds the one matching `groupId`, and POSTs /accept.
// Uses global fetch (not page.request) so the API calls are fully decoupled
// from the inviter's browser context. A short retry loop guards against the
// race where the invite API call (triggered by the UI Add button) has not yet
// landed when this runs.
// ---------------------------------------------------------------------------

const ACCEPT_RETRY_ATTEMPTS = 10;
const ACCEPT_RETRY_DELAY_MS = 250;

type GroupsApiResponse = {
  invitations: Array<{ id: string; groupId: string }>;
};

export async function acceptInvitationViaApi(
  page: Page,
  groupId: string,
  inviteeEmail: string,
  inviteePassword: string,
): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

  // 1. Log the invitee in via the API (no second browser context).
  const loginResponse = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: inviteeEmail, password: inviteePassword }),
  });
  if (loginResponse.status !== 200) {
    throw new Error(
      `acceptInvitationViaApi: login failed for ${inviteeEmail} (status ${loginResponse.status})`,
    );
  }
  const { token } = (await loginResponse.json()) as { token: string };

  // 2. GET /api/groups to find the pending invitation whose groupId matches.
  //    Retry briefly — the invite POST (triggered by the UI Add button click)
  //    may still be in flight when this helper runs.
  let invitation: { id: string; groupId: string } | undefined;
  for (let attempt = 0; attempt < ACCEPT_RETRY_ATTEMPTS; attempt++) {
    const groupsResponse = await fetch(`${baseURL}/api/groups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (groupsResponse.status !== 200) {
      throw new Error(`acceptInvitationViaApi: GET /groups failed (status ${groupsResponse.status})`);
    }
    const groupsData = (await groupsResponse.json()) as GroupsApiResponse;
    invitation = groupsData.invitations.find((i) => i.groupId === groupId);
    if (invitation) break;
    await page.waitForTimeout(ACCEPT_RETRY_DELAY_MS);
  }
  if (!invitation) {
    throw new Error(
      `acceptInvitationViaApi: no pending invitation for group ${groupId} found for ${inviteeEmail}`,
    );
  }

  // 3. POST /api/groups/:groupId/invitations/:invitationId/accept.
  const acceptResponse = await fetch(
    `${baseURL}/api/groups/${groupId}/invitations/${invitation.id}/accept`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  if (acceptResponse.status !== 200) {
    throw new Error(`acceptInvitationViaApi: accept failed (status ${acceptResponse.status})`);
  }
}
