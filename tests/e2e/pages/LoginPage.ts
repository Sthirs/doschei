import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  private emailField: Locator;
  private passwordField: Locator;
  private signInButton: Locator;

  constructor(private page: Page) {
    this.emailField = this.page.getByLabel('Email');
    this.passwordField = this.page.getByLabel('Password', { exact: true });
    this.signInButton = this.page.getByRole('button', { name: 'Log in' });
  }

  async login(email: string, password: string) {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.signInButton.click();
  }

  async expectRedirectedToGroups() {
    await expect(this.page).toHaveURL(/\/groups$/);
  }
}
