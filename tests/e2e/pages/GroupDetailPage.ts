import { expect, type Page } from '@playwright/test';

export class GroupDetailPage {
  // Add Expense buttons (GroupDetailView.vue:565 desk, :572 mobile — two aria variants)
  private addExpenseButton = this.page.getByRole('button', { name: 'Add Expense' })
      .or(this.page.getByRole('button', { name: 'Add expense' }));

  private categoryPicker = this.page.getByRole('button', { name: /^Category:/ });
  // Both modals' description input — create has placeholder="E.g., Dinner, Taxi...",
  // edit has none, so locate by role instead.
  private descriptionInput = this.page.getByRole('textbox');
  private amountInput = this.page.getByLabel('Amount');
  private paidByPicker = this.page.getByRole('button', { name: 'Select who paid' });
  private saveExpenseButton = this.page.getByRole('button', { name: 'Save', exact: true });
  private deleteExpenseButton = this.page.getByRole('button', { name: 'Delete' });
  private confirmDeleteButton = this.page.getByRole('button', { name: 'Confirm' });

  constructor(private page: Page) {}

  async openAddExpense() {
    await this.addExpenseButton.click();
  }

  async setCategory(label: string) {
    await this.categoryPicker.click();
    // CategoryPicker.vue:111-137 — desktop popover aria-label="Select category"
    await this.page.getByRole('dialog', { name: 'Select category' })
        .getByRole('button', { name: label }).click();
  }

  async fillDescription(text: string) {
    await this.descriptionInput.fill(text);
  }

  async fillAmount(value: string) {
    await this.amountInput.fill(value);
  }

  async setPaidBy(displayName: string) {
    await this.paidByPicker.click();
    // UserPicker.vue:111-142 — popover aria-label="Select who paid"
    await this.page.getByRole('dialog', { name: 'Select who paid' })
        .getByRole('button', { name: displayName }).click();
  }

  async selectSplitMember(displayName: string) {
    // GroupDetailView.vue:680-697 — checkboxes are inside <label> with member displayName
    await this.page.getByLabel(displayName, { exact: false }).check();
  }

  async deselectSplitMember(displayName: string) {
    await this.page.getByLabel(displayName, { exact: false }).uncheck();
  }

  async setEqualSplit() {
    await this.page.getByRole('button', { name: 'Equal' }).click();
  }

  async setPercentSplit(values: Record<string, number>) {
    await this.page.getByRole('button', { name: 'Percentage' }).click();
    for (const [displayName, percent] of Object.entries(values)) {
      // Scope by row class so ancestor divs are
      // excluded; <input type="number"> is role=spinbutton, not textbox.
      const row = this.page
          .locator('div.flex.items-center.gap-2')
          .filter({ hasText: displayName })
          .filter({ hasText: '%' });
      await row.getByRole('spinbutton').fill(String(percent));
    }
  }

  async setFixedSplit(values: Record<string, number>) {
    await this.page.getByRole('button', { name: 'Fixed amount' }).click();
    for (const [displayName, value] of Object.entries(values)) {
      // Same shape as percent row, "€" suffix.
      const row = this.page
          .locator('div.flex.items-center.gap-2')
          .filter({ hasText: displayName })
          .filter({ hasText: '\u20AC' });
      await row.getByRole('spinbutton').fill(String(value));
    }
  }

  async setDate(yyyyMmDd: string) {
    // @vuepic/vue-datepicker exposes `data-test-id="dp-input"` on the input element
    const dateInput = this.page.locator('[data-test-id="dp-input"]');
    await dateInput.click();
    await dateInput.clear();
    await dateInput.fill(yyyyMmDd);
    await dateInput.press('Enter'); // auto-apply commits
  }

  async saveExpense() {
    await this.saveExpenseButton.click();
    // Wait for modal to close
    await expect(this.saveExpenseButton).not.toBeVisible({ timeout: 10000 });
  }

  async expectExpenseRowVisible(opts: { description: string; amount: string; paidByName: string }) {
    // GroupDetailView.vue:1078-1117 — the expense row structure:
    // <li><div class="flex items-center justify-between gap-3 ...">
    //   <div class="w-10...">...</div>             <!-- date -->
    //   <div class="h-8 w-8...">...</div>          <!-- category icon -->
    //   <div class="min-w-0 flex-1">
    //     <p>{{expense.description}}</p>           ← getByText finds this
    //     <p>Paid by {{expense.paidByName}}</p>
    //   </div>
    //   <span>€{{expense.amount.toFixed(2)}}</span> ← SIBLING of min-w-0, needs parent-of-parent
    // </div></li>
    const descriptionEl = this.page.getByText(opts.description, { exact: true });
    // Go up 2 levels from the <p> to the flex container (description → min-w-0 → flex container)
    const flexContainer = descriptionEl.locator('..').locator('..');
    await expect(flexContainer.getByText(`Paid by ${opts.paidByName}`)).toBeVisible();
    await expect(flexContainer.getByText(`\u20AC${parseFloat(opts.amount).toFixed(2)}`)).toBeVisible();
  }

  async openExpense(description: string) {
    // Click the expense row to open the edit modal
    await this.page.getByText(description, { exact: true }).click();
  }

  async deleteCurrentExpense() {
    await this.deleteExpenseButton.click();
    // Delete confirmation (GroupDetailView.vue:1031-1059)
    await expect(this.page.getByText('Are you sure?')).toBeVisible();
    await this.confirmDeleteButton.click();
    // Wait for modal to close
    await expect(this.confirmDeleteButton).not.toBeVisible({ timeout: 10000 });
  }

  async expectNoExpenses() {
    // GroupDetailView.vue:1120
    await expect(this.page.getByText('No expenses yet.')).toBeVisible();
  }
}
