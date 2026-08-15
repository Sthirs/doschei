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

  // -- New: Figma-aligned selectors (for T6 e2e) --

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
}
