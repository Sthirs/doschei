import { expect, type Page } from '@playwright/test';

export class GroupSettingsPage {
  private nameInput = this.page.getByLabel('Group Name');
  private saveButton = this.page.getByRole('button', { name: 'Save' });
  private memberEmailInput = this.page.getByPlaceholder('user@example.com');
  private addButton = this.page.getByRole('button', { name: 'Add' });

  constructor(private page: Page) {}

  async rename(newName: string) {
    await this.nameInput.fill(newName);
    await this.saveButton.click();
  }

  async inviteByEmail(email: string) {
    await this.memberEmailInput.fill(email);
    await this.addButton.click();
  }

  async expectMemberVisible(displayName: string) {
    // GroupSettingsPanel.vue:110-129 — members <ul> <li> with <p>{{member.displayName}}</p>
    await expect(this.page.getByText(displayName, { exact: true })).toBeVisible();
  }

  async expectMemberEmailVisible(email: string) {
    // GroupSettingsPanel.vue:117-118 — <p class="truncate text-xs ...">{{member.email}}</p>
    await expect(this.page.getByText(email, { exact: true })).toBeVisible();
  }
}
