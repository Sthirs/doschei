import { promises as fs } from 'node:fs';

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

  // Settle-up dialog (SettleUpModal.vue:133-137 — role=dialog, aria-label="Settle up").
  // All settle-up locators are scoped inside this dialog so they don't collide with
  // the expense modal's identically-named "Save" / "Delete" / "Confirm" buttons.
  private settleUpDialog = this.page.getByRole('dialog', { name: 'Settle up' });
  // GroupDetailView.vue:644-648 — the "Settle up" trigger button.
  private settleUpButton = this.page.getByRole('button', { name: 'Settle up' });
  // SettleUpModal.vue:213-219 — submit button. `exact: true` because the form also
  // renders "Saving..." while the request is in flight.
  private settleUpSaveButton = this.settleUpDialog.getByRole('button', { name: 'Save', exact: true });
  // SettleUpModal.vue:196-203 — only visible in edit mode.
  private settleUpDeleteButton = this.settleUpDialog.getByRole('button', { name: 'Delete' });
  // SettleUpModal.vue:249-256 — only visible after Delete is clicked (showDeleteConfirm).
  private settleUpConfirmDeleteButton = this.settleUpDialog.getByRole('button', { name: 'Confirm' });

  // Export controls (GroupDetailView.vue — "Export" button next to "Settle up" opens
  // a modal with a vue-datepicker month picker and an "Export" action button).
  // `exact: true` on the trigger so it doesn't match "Exporting…" (in-flight state).
  private exportTriggerButton = this.page.getByRole('button', { name: /^Export$/, exact: true });
  private exportDialog = this.page.getByRole('dialog', { name: 'Export CSV' });
  private exportMonthPicker = this.exportDialog.locator('[data-test-id="dp-input"]');
  private exportActionButton = this.exportDialog.getByRole('button', { name: /^Export$/, exact: true });

  constructor(private page: Page) {}

  async getGroupId(): Promise<string> {
    const id = this.page.url().split('/').pop();
    if (!id) {
      throw new Error(`getGroupId: no id segment in URL ${this.page.url()}`);
    }
    return id;
  }

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

  async openSettleUp() {
    await this.settleUpButton.click();
    await expect(this.settleUpDialog).toBeVisible();
  }

  async getSettleUpAmount(): Promise<string> {
    // SettleUpModal.vue:155-166 — the amount input is wrapped in a <label> with
    // text "Amount". Scoping to settleUpDialog disambiguates from the expense
    // modal's identically-labelled input.
    return this.settleUpDialog.getByLabel('Amount').inputValue();
  }

  async setSettleUpAmount(value: string) {
    await this.settleUpDialog.getByLabel('Amount').fill(value);
  }

  async getSettleUpPayer(): Promise<string | null> {
    // UserPicker.vue:80-99 — the trigger button's aria-label is "Select who paid"
    // and its visible text is the selected member's display name (or "Select..."
    // when nothing is picked). The "Paid by" picker is the first such trigger
    // inside the settle-up dialog (SettleUpModal.vue:147, :152).
    const trigger = this.settleUpDialog.getByRole('button', { name: 'Select who paid' }).first();
    return trigger.textContent();
  }

  async setSettleUpPayer(displayName: string) {
    // Both pickers in SettleUpModal have aria-label="Select who paid"
    // (UserPicker.vue:84 — hardcoded, no prop override). The "Paid by" picker is
    // the first such trigger inside the settle-up dialog.
    const trigger = this.settleUpDialog.getByRole('button', { name: 'Select who paid' }).first();
    await trigger.click();
    // The UserPicker popover is teleported to <body> (UserPicker.vue:145), so it
    // is NOT inside settleUpDialog — use page scope to find it.
    await this.page.getByRole('dialog', { name: 'Select who paid' })
        .getByRole('button', { name: displayName }).click();
  }

  async setSettleUpPayee(displayName: string) {
    // The "Paid to" picker is the second "Select who paid" trigger inside the
    // settle-up dialog (SettleUpModal.vue:152).
    const trigger = this.settleUpDialog.getByRole('button', { name: 'Select who paid' }).nth(1);
    await trigger.click();
    await this.page.getByRole('dialog', { name: 'Select who paid' })
        .getByRole('button', { name: displayName }).click();
  }

  async saveSettleUp() {
    await this.settleUpSaveButton.click();
    // Wait for the settle-up dialog to close (parent component hides it on
    // `saved` / `deleted` emits — SettleUpModal.vue:110, :124).
    await expect(this.settleUpDialog).not.toBeVisible({ timeout: 10000 });
  }

  async expectSettlementRowVisible(opts: { payerName: string; payeeName: string; amount: string }) {
    // GroupDetailView.vue:1129-1171 — same row shape as expenses, but the
    // subtitle is `«payer» paid «payee»` (not `Paid by …`) and the description
    // is the literal string "Settlement". Use the description to anchor, then
    // walk up two levels to the flex container.
    const descriptionEl = this.page.getByText('Settlement', { exact: true });
    const flexContainer = descriptionEl.locator('..').locator('..');
    await expect(flexContainer.getByText(`${opts.payerName} paid ${opts.payeeName}`)).toBeVisible();
    await expect(flexContainer.getByText(`\u20AC${parseFloat(opts.amount).toFixed(2)}`)).toBeVisible();
  }

  async openSettlement(payerName: string, payeeName: string) {
    // Click the subtitle text inside the settlement row. The <li> click handler
    // (GroupDetailView.vue:1135) opens the settle-up modal in edit mode.
    await this.page.getByText(`${payerName} paid ${payeeName}`).click();
    await expect(this.settleUpDialog).toBeVisible();
  }

  async deleteCurrentSettlement() {
    // First click reveals the confirm panel (SettleUpModal.vue:196-203, :226-258).
    await this.settleUpDeleteButton.click();
    await expect(this.settleUpConfirmDeleteButton).toBeVisible();
    await this.settleUpConfirmDeleteButton.click();
    // The parent closes the dialog on the `deleted` emit.
    await expect(this.settleUpDialog).not.toBeVisible({ timeout: 10000 });
  }

  async openExportModal(): Promise<void> {
    await this.exportTriggerButton.click();
    await expect(this.exportDialog).toBeVisible();
  }

  async setExportMonth(yyyyMm: string): Promise<void> {
    // @vuepic/vue-datepicker exposes `data-test-id="dp-input"` on the input element.
    // Scoped to exportDialog so it doesn't collide with the expense date picker.
    await this.exportMonthPicker.click();
    await this.exportMonthPicker.clear();
    await this.exportMonthPicker.fill(yyyyMm);
    await this.exportMonthPicker.press('Enter'); // auto-apply commits
  }

  async clickExportAndExpectDownload(): Promise<{ filename: string; text: string }> {
    // Playwright hands us the download via the `download` event; race the wait
    // against the click so we never miss it. `download.path()` is a real
    // filesystem path managed by Playwright (no dialog interception needed).
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.exportActionButton.click(),
    ]);
    const filename = download.suggestedFilename();
    const text = (await fs.readFile(await download.path())).toString('utf8');
    return { filename, text };
  }
}
