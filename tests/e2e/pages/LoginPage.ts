import { expect, type Page } from '@playwright/test';

export class LoginPage {
  private emailField = this.page.getByLabel('Email');
  private passwordField = this.page.getByLabel('Password', { exact: true });
  private signInButton = this.page.getByRole('button', { name: 'Log in' });

  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.signInButton.click();
  }

  async expectRedirectedToGroups() {
    await expect(this.page).toHaveURL(/\/groups$/);
  }
}
