import { expect, type Page } from '@playwright/test';

export class GroupsPage {
  private createGroupButton = this.page.getByRole('button', { name: 'Create group' });
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
}
