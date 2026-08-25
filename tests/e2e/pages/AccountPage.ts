import { type Page } from '@playwright/test';

export class AccountPage {
  readonly avatar = this.page.getByTestId('account-avatar');
  readonly nameHeading = this.page.getByTestId('account-name-heading');
  readonly nameInput = this.page.locator('#account-name');
  readonly emailInput = this.page.locator('#account-email');
  readonly saveButton = this.page.getByTestId('account-save');
  readonly topbarAvatar = this.page.getByRole('button', { name: /Open account page|Apri la pagina account/ });
  readonly languageSelect = this.page.getByTestId('account-language');
  readonly avatarEditBadge = this.page.getByTestId('account-avatar-edit');
  readonly avatarInput = this.page.getByTestId('account-avatar-input');

  constructor(private page: Page) {}

  /** Switch the interface language; the change handler persists via PATCH. */
  async selectLanguage(locale: 'en' | 'it') {
    await this.languageSelect.selectOption(locale);
  }
}
