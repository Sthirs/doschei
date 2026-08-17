import { expect, type Page } from '@playwright/test';

const TOKEN_KEY = 'doschei.auth.token';

export class GroupSettingsPage {
  // GroupSettingsPanel.vue:126-137 — the redesigned panel uses a sibling
  // <label>GROUP NAME</label> (no `for`/`id`, no wrapping), so getByLabel
  // cannot associate the label with the input. Scope via the label text to
  // its parent <div>, then locate the <input> within.
  private nameInput = this.page.getByText('GROUP NAME', { exact: true }).locator('..').locator('input');
  private saveButton = this.page.getByRole('button', { name: 'Save' });
  private memberEmailInput = this.page.getByPlaceholder('user@example.com');
  private addButton = this.page.getByRole('button', { name: 'Add' });

  constructor(private page: Page) {}

  async rename(newName: string) {
    await this.nameInput.fill(newName);
    await this.saveButton.click();
  }

  async expectNameValue(value: string) {
    await expect(this.nameInput).toHaveValue(value);
  }

  async inviteByEmail(email: string) {
    await this.memberEmailInput.fill(email);
    await this.addButton.click();
  }

  async expectMemberVisible(displayName: string) {
    // GroupSettingsPanel.vue:110-129 — members <ul> <li> with <p>{{member.displayName}}</p>
    await expect(this.page.getByText(displayName, { exact: true })).toBeVisible();
  }

  async expectMemberNotVisible(displayName: string) {
    // The invitee's displayName must not appear anywhere on the settings page
    // until they accept (name-hidden invariant).
    await expect(this.page.getByText(displayName, { exact: true })).not.toBeVisible();
  }

  async expectMemberEmailVisible(email: string) {
    // GroupSettingsPanel.vue:117-118 — <p class="truncate text-xs ...">{{member.email}}</p>
    await expect(this.page.getByText(email, { exact: true })).toBeVisible();
  }

  // -- Pending invitation selectors (GroupSettingsPanel.vue:228-266) --

  /**
   * The PENDING INVITATIONS section is a <div> containing a <label> with the
   * text "PENDING INVITATIONS" and a <ul> of pending rows. Each row renders the
   * invitee email only (no displayName, no avatar).
   */
  private pendingInvitationsSection() {
    // GroupSettingsPanel.vue:233-235 — <label>PENDING INVITATIONS</label>; its
    // parent <div> wraps the whole section.
    return this.page.getByText('PENDING INVITATIONS', { exact: true }).locator('..');
  }

  async expectPendingInvitationVisible(email: string) {
    // GroupSettingsPanel.vue:243-245 — <p>{{ invitation.email }}</p>
    await expect(this.pendingInvitationsSection().getByText(email, { exact: true })).toBeVisible();
  }

  async expectPendingInvitationNameHidden(displayName: string) {
    // The invitee's displayName must NOT appear in the PENDING INVITATIONS
    // section (email-only rendering per ADR-0014).
    await expect(
      this.pendingInvitationsSection().getByText(displayName, { exact: true }),
    ).not.toBeVisible();
  }

  /**
   * Cancel a pending invitation by invitee email via the API
   * (DELETE /groups/:groupId/invitations/:invitationId). Reads the inviter's
   * bearer token from localStorage and the groupId from the current settings
   * URL (/groups/:id/settings).
   */
  async cancelPendingInvitation(email: string) {
    const token = await this.page.evaluate((key: string) => localStorage.getItem(key), TOKEN_KEY);
    if (!token) {
      throw new Error('cancelPendingInvitation: no auth token in localStorage');
    }

    const match = this.page.url().match(/\/groups\/([^/]+)\/settings/);
    if (!match) {
      throw new Error(`cancelPendingInvitation: not on a settings page (url=${this.page.url()})`);
    }
    const groupId = match[1];

    // GET /groups/:id to find the pending invitation id for this email.
    const groupResponse = await this.page.request.get(`/api/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (groupResponse.status() !== 200) {
      throw new Error(`cancelPendingInvitation: GET /groups/${groupId} failed (${groupResponse.status()})`);
    }
    const groupJson = (await groupResponse.json()) as {
      group: { pendingInvitations: Array<{ id: string; email: string }> };
    };
    const invitation = groupJson.group.pendingInvitations.find((i) => i.email === email);
    if (!invitation) {
      throw new Error(`cancelPendingInvitation: no pending invitation for ${email}`);
    }

    const deleteResponse = await this.page.request.delete(
      `/api/groups/${groupId}/invitations/${invitation.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (deleteResponse.status() !== 204) {
      throw new Error(`cancelPendingInvitation: DELETE failed (${deleteResponse.status()})`);
    }
  }
}
