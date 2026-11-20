import { type Locator, type Page } from '@playwright/test';

export class AccountPage {
  readonly avatar: Locator;
  readonly nameHeading: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly saveButton: Locator;
  readonly topbarAvatar: Locator;
  readonly languageSelect: Locator;
  readonly avatarEditBadge: Locator;
  readonly avatarInput: Locator;
  readonly versionLine: Locator;

  constructor(private page: Page) {
    this.avatar = this.page.getByTestId('account-avatar');
    this.nameHeading = this.page.getByTestId('account-name-heading');
    this.nameInput = this.page.locator('#account-name');
    this.emailInput = this.page.locator('#account-email');
    this.saveButton = this.page.getByTestId('account-save');
    this.topbarAvatar = this.page.getByRole('button', { name: /Open account page|Apri la pagina account/ });
    this.languageSelect = this.page.getByTestId('account-language');
    this.avatarEditBadge = this.page.getByTestId('account-avatar-edit');
    this.avatarInput = this.page.getByTestId('account-avatar-input');
    this.versionLine = this.page.getByTestId('account-version');
  }

  /** Switch the interface language; the change handler persists via PATCH. */
  async selectLanguage(locale: 'en' | 'it') {
    await this.languageSelect.selectOption(locale);
  }
}
