import { type Page } from '@playwright/test';

export class AccountPage {
  readonly avatar = this.page.getByTestId('account-avatar');
  readonly nameHeading = this.page.getByTestId('account-name-heading');
  readonly nameInput = this.page.locator('#account-name');
  readonly emailInput = this.page.locator('#account-email');
  readonly saveButton = this.page.getByTestId('account-save');
  readonly topbarAvatar = this.page.getByRole('button', { name: 'Open account page' });

  constructor(private page: Page) {}
}
