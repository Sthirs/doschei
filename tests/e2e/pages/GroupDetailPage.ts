import { promises as fs } from 'node:fs';

import { expect, type Page } from '@playwright/test';

/**
 * GroupDetailPage — page object for the routed expense/settle-up forms that
 * replaced the legacy in-place modal dialogs (see ADR-0012).
 *
 * Form pages live at:
 *   /groups/:id/expenses/new          → Add Expense (ExpenseFormView)
 *   /groups/:id/expenses/:eid/edit   → Edit Expense
 *   /groups/:id/settle-up             → Settle Up (create)
 *   /groups/:id/settlements/:sid/edit → Settle Up (edit)
 *
 * Submit/cancel/return on these pages navigates back to /groups/:id
 * (group-detail), not to a closed overlay.
 */
export class GroupDetailPage {
  // ExpenseFormView.vue:333-339 — the description input shares placeholder
  // "Description"; the settle-up form has no description field, so the
  // placeholder is unambiguous.
  private descriptionInput = this.page.getByPlaceholder('Description');
  // ExpenseFormView.vue:309-328 — Amount is the <label> above a type="number"
  // input with placeholder "0.00". (SettleUpView has no <label for=amount>, so
  // the settle-up amount helper locates the input by placeholder instead.)
  private amountInput = this.page.getByLabel('Amount');
  // ExpenseFormView.vue:578-585 — submit button reads "Save" (or "Saving..."
  // while in flight). It is an in-flow button at the end of the form, NOT a
  // modal footer action.
  private saveExpenseButton = this.page.getByRole('button', { name: 'Save', exact: true });
  // ExpenseFormView.vue:588-596 — Delete is only rendered in edit mode.
  // `exact: true` so it doesn't match the "Confirm Delete" panel button.
  private deleteExpenseButton = this.page.getByRole('button', { name: 'Delete', exact: true });
  // ExpenseFormView.vue:637-645 — destructive confirm button.
  private confirmDeleteButton = this.page.getByRole('button', { name: 'Confirm Delete' });

  // CategoryPicker.vue:81-94 — the round category trigger button has an
  // aria-label of the form "Category: <label>". CategoryPicker is reused by
  // ExpenseFormView, so the same selector works on the routed form.
  private categoryPicker = this.page.getByRole('button', { name: /^Category:/ });
  // CategoryPicker.vue:160, :252 — both the desktop popover and the mobile
  // sheet expose a text input with aria-label="Search categories". The desktop
  // popover auto-focuses this input on open (CategoryPicker.vue:53-56).
  private categorySearchInput = this.page.getByRole('textbox', { name: 'Search categories' });
  // CategoryPicker.vue:106-113 — desktop popover aria-label="Select category".
  // The mobile sheet (CategoryPicker.vue:165-178) uses the same aria-label so
  // the locator works on both layouts.
  private categoryDialog = this.page.getByRole('dialog', { name: 'Select category' });

  // SettleUpView.vue:317, :324 — the UserPicker instances each carry a
  // distinct data-testid ("payer-picker" / "payee-picker", passed via the
  // testId prop on UserPicker.vue), so payer and payee are looked up
  // unambiguously instead of relying on DOM order via .first()/.nth(1).
  private settleUpPayerTrigger = this.page.getByTestId('payer-picker');
  private settleUpPayeeTrigger = this.page.getByTestId('payee-picker');
  // SettleUpView.vue:313-321 — submit button reads "+ Record Payment" (or
  // "Saving..." while the request is in flight).
  private settleUpSaveButton = this.page.getByRole('button', { name: 'Record Payment' });
  // SettleUpView.vue:333-340 — the edit-only trigger that reveals the confirm
  // panel. Text is exactly "Delete this payment".
  private settleUpDeleteButton = this.page.getByRole('button', { name: 'Delete this payment' });
  // SettleUpView.vue:369-376 — confirm-panel destructive button. `exact: true`
  // is required because the trigger button "Delete this payment" is also in
  // the DOM while the confirm panel is visible.
  private settleUpConfirmDeleteButton = this.page.getByRole('button', { name: 'Delete', exact: true });

  // Export controls (GroupDetailView.vue — "Export" button next to "Settle Up"
  // opens a modal with native Month/Year <select>s and an "Export Expenses"
  // action button). The export modal is still a real overlay (separate from
  // the new routed forms), so the old `role="dialog"` scope is still correct.
  private exportTriggerButton = this.page.getByRole('button', { name: /^Export$/, exact: true });
  private exportDialog = this.page.getByRole('dialog', { name: 'Export expenses' });
  private exportMonthSelect = this.exportDialog.getByLabel('Month');
  private exportYearSelect = this.exportDialog.getByLabel('Year');
  private exportActionButton = this.exportDialog.getByRole('button', { name: 'Export Expenses' });

  // Totals controls (GroupDetailView.vue → ActionRow.vue — the "Totals" button
  // next to "Export" opens the TotalsModal bottom sheet, a teleported
  // role="dialog" holding the three-month stacked chart and a period stepper).
  private totalsTriggerButton = this.page.getByRole('button', { name: /^Totals$/, exact: true });
  private totalsDialog = this.page.getByRole('dialog', { name: 'Totals' });
  private totalsRange = this.totalsDialog.getByTestId('totals-range');
  private totalsPreviousButton = this.totalsDialog.getByRole('button', { name: 'Previous period' });
  private totalsNextButton = this.totalsDialog.getByRole('button', { name: 'Next period' });

  constructor(private page: Page) {}

  // ---------------------------------------------------------------------------
  // Navigation: routed pages (ADR-0012)
  // ---------------------------------------------------------------------------

  async gotoAddExpense(groupId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}/expenses/new`);
  }

  async gotoEditExpense(groupId: string, expenseId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}/expenses/${expenseId}/edit`);
  }

  async gotoSettleUpCreate(groupId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}/settle-up`);
  }

  async gotoSettleUpEdit(groupId: string, settlementId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}/settlements/${settlementId}/edit`);
  }

  async getGroupId(): Promise<string> {
    const id = this.page.url().split('/').pop();
    if (!id) {
      throw new Error(`getGroupId: no id segment in URL ${this.page.url()}`);
    }
    return id;
  }

  // ---------------------------------------------------------------------------
  // Backward-compat: legacy modal-style entry points.
  // The export spec still calls `openAddExpense()` (no args), so it is kept
  // as a wrapper around `gotoAddExpense(await this.getGroupId())`. New code
  // should use the explicit `goto*` navigators above.
  // ---------------------------------------------------------------------------

  async openAddExpense(): Promise<void> {
    const groupId = await this.getGroupId();
    await this.gotoAddExpense(groupId);
  }

  // ---------------------------------------------------------------------------
  // Form fields: shared between Add-Expense and Edit-Expense routed pages
  // ---------------------------------------------------------------------------

  async setCategory(label: string) {
    await this.categoryPicker.click();
    await this.categoryDialog.getByRole('button', { name: label }).click();
  }

  // CategoryPicker.vue:79-87 — Enter on the search input with a non-empty
  // query calls `select(filteredGroups[0].entries[0].key)` which emits
  // update:modelValue and closes the picker. The grid-click helper
  // `setCategory` above is the legacy path; this is the new free-text path.
  async searchAndPickCategory(query: string) {
    await this.categoryPicker.click();
    await expect(this.categoryDialog).toBeVisible();
    await this.categorySearchInput.fill(query);
    await this.categorySearchInput.press('Enter');
    // `select()` calls `close()` so the dialog is removed on success.
    await expect(this.categoryDialog).not.toBeVisible({ timeout: 5000 });
  }

  async getCategoryLabel(): Promise<string> {
    const raw = (await this.categoryPicker.getAttribute('aria-label')) ?? '';
    const match = /^Category:\s*(.+)$/.exec(raw);
    return match ? match[1] : raw;
  }

  async expectCategoryLabel(label: string) {
    await expect(this.categoryPicker).toHaveAttribute('aria-label', `Category: ${label}`);
  }

  // ExpenseFormView.vue:30-34 — description-driven auto-selection debounces
  // 300ms before flipping the category, so a 1000ms poll ceiling leaves
  // comfortable margin for Vue render + commit.
  async expectCategoryLabelEventually(label: string, timeoutMs = 1000) {
    await expect
        .poll(() => this.categoryPicker.getAttribute('aria-label'), {
          message: `category trigger aria-label`,
          timeout: timeoutMs,
          intervals: [50, 100, 100],
        })
        .toBe(`Category: ${label}`);
  }

  async fillDescription(text: string) {
    await this.descriptionInput.fill(text);
  }

  async fillAmount(value: string) {
    await this.amountInput.fill(value);
  }

  async setPaidBy(displayName: string) {
    // ExpenseFormView.vue:468-508 — member chips inside the "Paid by"
    // section, anchored by data-testid="paid-by-section". The button label
    // shows only the first word of the display name (plus the avatar
    // letter), so match on the first word.
    const firstWord = displayName.trim().split(/\s+/)[0];
    await this.page
        .getByTestId('paid-by-section')
        .getByRole('button', { name: new RegExp(firstWord) })
        .click();
  }

  async expectPaidBySelected(displayName: string) {
    const firstWord = displayName.trim().split(/\s+/)[0];
    const chip = this.page
        .getByTestId('paid-by-section')
        .getByRole('button', { name: new RegExp(firstWord) });
    const cls = (await chip.getAttribute('class')) ?? '';
    expect(cls.includes('ring-[#6554E7]'), `paid-by chip "${displayName}" should carry selection ring, got: ${cls}`).toBe(true);
  }

  private splitMemberButton(displayName: string) {
    // ExpenseFormView.vue:514-... — toggle chips inside the "Split with"
    // section, anchored by data-testid="split-with-section". The button
    // label shows only the first word of the display name (plus the avatar
    // letter), so match on the first word.
    const firstWord = displayName.trim().split(/\s+/)[0];
    return this.page
        .getByTestId('split-with-section')
        .getByRole('button', { name: new RegExp(firstWord) });
  }

  async selectSplitMember(displayName: string) {
    const chip = this.splitMemberButton(displayName);
    const cls = (await chip.getAttribute('class')) ?? '';
    if (!cls.includes('ring-[#6554E7]')) {
      await chip.click();
    }
  }

  async deselectSplitMember(displayName: string) {
    const chip = this.splitMemberButton(displayName);
    const cls = (await chip.getAttribute('class')) ?? '';
    if (cls.includes('ring-[#6554E7]')) {
      await chip.click();
    }
  }

  async setEqualSplit() {
    // ExpenseFormView.vue:436-438 — the EQUAL tab reads "Equally" (not
    // "Equal" as the legacy modal did).
    await this.page.getByRole('button', { name: 'Equally' }).click();
  }

  async setPercentSplit(values: Record<string, number>) {
    await this.page.getByRole('button', { name: 'Percentage' }).click();
    for (const [displayName, percent] of Object.entries(values)) {
      const row = this.page
          .locator('div.flex.items-center.gap-2')
          .filter({ hasText: displayName })
          .filter({ hasText: '%' });
      await row.getByRole('spinbutton').fill(String(percent));
    }
  }

  async setFixedSplit(values: Record<string, number>) {
    await this.page.getByRole('button', { name: 'Fixed', exact: true }).click();
    for (const [displayName, value] of Object.entries(values)) {
      const row = this.page
          .locator('div.flex.items-center.gap-2')
          .filter({ hasText: displayName })
          .filter({ hasText: '\u20AC' });
      await row.getByRole('spinbutton').fill(String(value));
    }
  }

  async setDate(yyyyMmDd: string) {
    // DateTimePicker.vue:64-113 — the trigger has data-test-id="dtp" and
    // contains two SVGs (a calendar glyph and a chevron-down). Clicking
    // opens the bottom sheet (DateTimePicker.vue:115-120 — role="dialog",
    // aria-label="Select date").
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
    if (!match) throw new Error(`setDate: invalid format "${yyyyMmDd}"`);
    const targetYear = parseInt(match[1], 10);
    const targetMonth = parseInt(match[2], 10); // 1-12
    const targetDay = parseInt(match[3], 10);

    const monthNames = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];
    const titleToIndex = (title: string): number => {
      const m = /^(\w+)\s+(\d{4})$/.exec(title.trim());
      if (!m) return Number.NaN;
      return parseInt(m[2], 10) * 12 + monthNames.indexOf(m[1]);
    };
    const targetTitle = `${monthNames[targetMonth - 1]} ${targetYear}`;
    const targetIndex = titleToIndex(targetTitle);

    await this.page.locator('[data-test-id="dtp"]').click();
    const dialog = this.page.getByRole('dialog', { name: 'Select date' });
    await expect(dialog).toBeVisible();

    // Navigate to the target month (cap at 40 steps — covers ~3 years).
    const title = dialog.locator('.vc-header .vc-title').first();
    for (let i = 0; i < 40; i++) {
      const currentTitle = (await title.textContent()) ?? '';
      if (currentTitle.trim() === targetTitle) break;
      const arrow = titleToIndex(currentTitle) > targetIndex
          ? '.vc-arrow.vc-prev'
          : '.vc-arrow.vc-next';
      await dialog.locator(arrow).click();
      // Wait for the title to actually change before re-reading, so we never
      // act on a stale month (the 100ms/title-lag race from datetime-picker.spec).
      await expect(title).not.toHaveText(currentTitle.trim(), { timeout: 3000 });
    }

    // Click the target day — scope to in-month cells so adjacent-month days
    // with the same number are not matched.
    await dialog
        .locator('.vc-day:not(.is-not-in-month) .vc-day-content')
        .filter({ hasText: new RegExp(`^${targetDay}$`) })
        .first()
        .click();

    // Commit and wait for the sheet to close.
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  }

  // ---------------------------------------------------------------------------
  // Expense form: save / delete / row assertions
  // ---------------------------------------------------------------------------

  async saveExpense() {
    await this.saveExpenseButton.click();
    // ExpenseFormView.vue:142-148 — submit navigates back to /groups/:id.
    await this.page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10000 });
  }

  async expectExpenseRowVisible(opts: { description: string; amount: string; paidByName: string }) {
    // GroupDetailView.vue:466 — each expense row <li> carries
    // data-testid="expense-row"; scope within it by description text so the
    // "Paid by" line and amount are read from the matching row, not siblings.
    const row = this.page.getByTestId('expense-row').filter({ hasText: opts.description });
    await expect(row.getByText(`Paid by ${opts.paidByName}`)).toBeVisible();
    await expect(row.getByText(`\u20AC${parseFloat(opts.amount).toFixed(2)}`)).toBeVisible();
  }

  async deleteCurrentExpense() {
    // ExpenseFormView.vue:588-596 — form Delete → confirm panel
    // (line 610-657, with title "Are you sure?") → "Confirm Delete" button.
    await this.deleteExpenseButton.click();
    await expect(this.page.getByText('Are you sure?')).toBeVisible();
    await this.confirmDeleteButton.click();
    // confirmDelete() (line 223-237) navigates back to /groups/:id on success.
    await this.page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10000 });
  }

  async expectNoExpenses() {
    // GroupDetailView.vue:583 — empty state renders without a trailing period.
    await expect(this.page.getByText('No expenses yet')).toBeVisible();
  }

  // ---------------------------------------------------------------------------
  // Settle-up form: amount / payer / payee / save / delete
  // ---------------------------------------------------------------------------

  async getSettleUpAmount(): Promise<string> {
    // SettleUpView.vue:256-264 — the amount input is the only
    // `input[type="number"][placeholder="0.00"]` on the settle-up page; it
    // is NOT wrapped in a <label> (unlike the expense form), so we locate it
    // by placeholder.
    return this.page.getByPlaceholder('0.00').inputValue();
  }

  async setSettleUpAmount(value: string) {
    await this.page.getByPlaceholder('0.00').fill(value);
  }

  async getSettleUpPayer(): Promise<string | null> {
    // UserPicker.vue:80-99 — the trigger button's aria-label is
    // "Select who paid" and its visible text is the selected member's
    // display name (or "Select..." when nothing is picked).
    return this.settleUpPayerTrigger.textContent();
  }

  async setSettleUpPayer(displayName: string) {
    await this.settleUpPayerTrigger.click();
    // UserPicker popover is teleported to <body> (UserPicker.vue:145-207);
    // the desktop popover and the mobile sheet both expose
    // role="dialog" aria-label="Select who paid".
    await this.page.getByRole('dialog', { name: 'Select who paid' })
        .getByRole('button', { name: displayName }).click();
  }

  async setSettleUpPayee(displayName: string) {
    await this.settleUpPayeeTrigger.click();
    await this.page.getByRole('dialog', { name: 'Select who paid' })
        .getByRole('button', { name: displayName }).click();
  }

  async saveSettleUp() {
    await this.settleUpSaveButton.click();
    // SettleUpView.vue:152-156 — submit() navigates to /groups/:id.
    await this.page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10000 });
  }

  async expectSettlementRowVisible(opts: { payerName: string; payeeName: string; amount: string }) {
    // GroupDetailView.vue:466 — settlement rows share the same expense-row
    // <li> (data-testid="expense-row") but the description is the literal
    // "Settlement" and the subtitle is `«payer» paid «payee»`.
    const row = this.page.getByTestId('expense-row').filter({ hasText: 'Settlement' });
    await expect(row.getByText(`${opts.payerName} paid ${opts.payeeName}`)).toBeVisible();
    await expect(row.getByText(`\u20AC${parseFloat(opts.amount).toFixed(2)}`)).toBeVisible();
  }

  async deleteCurrentSettlement() {
    // SettleUpView.vue:333-340 — the form's "Delete this payment" trigger
    // reveals the confirm panel (line 343-378, with h3 "Delete payment?").
    await this.settleUpDeleteButton.click();
    await expect(this.page.getByText('Delete payment?', { exact: true })).toBeVisible();
    await this.settleUpConfirmDeleteButton.click();
    // deleteSettlement() (line 164-179) navigates back to /groups/:id.
    await this.page.waitForURL(/\/groups\/[^/]+$/, { timeout: 10000 });
  }

  // ---------------------------------------------------------------------------
  // Export (still a modal — unchanged from the previous spec)
  // ---------------------------------------------------------------------------

  async openExportModal(): Promise<void> {
    await this.exportTriggerButton.click();
    await expect(this.exportDialog).toBeVisible();
  }

  async setExportMonth(yyyyMm: string): Promise<void> {
    const [year, month] = yyyyMm.split('-').map(Number);
    const monthName = new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'long' });
    await this.exportMonthSelect.selectOption({ label: monthName });
    await this.exportYearSelect.selectOption({ label: String(year) });
  }

  // ---------------------------------------------------------------------------
  // Totals modal
  // ---------------------------------------------------------------------------

  async openTotalsModal(): Promise<void> {
    await this.totalsTriggerButton.click();
    await expect(this.totalsDialog).toBeVisible();
  }

  // The group-spend labels above the bars, oldest month first.
  async getTotalsGroupLabels(): Promise<string[]> {
    return this.totalsDialog.getByTestId('totals-bar-group').allInnerTexts();
  }

  // The user-share labels inside the purple segments. A month with no spend, or
  // a share too small to label legibly, contributes no entry.
  async getTotalsUserLabels(): Promise<string[]> {
    return this.totalsDialog.getByTestId('totals-bar-user').allInnerTexts();
  }

  async getTotalsRange(): Promise<string> {
    return (await this.totalsRange.innerText()).trim();
  }

  async getTotalsPeriodTotal(): Promise<string> {
    return (await this.totalsDialog.getByTestId('totals-period-total').innerText()).trim();
  }

  async expectTotalsCannotGoForward(): Promise<void> {
    await expect(this.totalsNextButton).toBeDisabled();
  }

  // Steps the window and waits for the label to change, so the assertion that
  // follows cannot race the re-render.
  async totalsPreviousPeriod(): Promise<void> {
    const before = await this.getTotalsRange();
    await this.totalsPreviousButton.click();
    await expect(this.totalsRange).not.toHaveText(before);
  }

  async totalsNextPeriod(): Promise<void> {
    const before = await this.getTotalsRange();
    await this.totalsNextButton.click();
    await expect(this.totalsRange).not.toHaveText(before);
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
