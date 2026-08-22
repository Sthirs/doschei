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

  // SettleUpView.vue:278, :285 — the UserPicker instances are identified by
  // their trigger aria-label "Select who paid" (UserPicker.vue:84). There are
  // two of them on the settle-up page (payer + payee), so .first() / .nth(1)
  // distinguish them. No dialog scope is needed: the form is the page, not an
  // overlay.
  private settleUpPayerTrigger = this.page.getByRole('button', { name: 'Select who paid' }).first();
  private settleUpPayeeTrigger = this.page.getByRole('button', { name: 'Select who paid' }).nth(1);
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
    // CategoryPicker.vue:106-113 — desktop popover aria-label="Select category".
    // The mobile sheet (CategoryPicker.vue:165-178) uses the same aria-label
    // so the locator works on both layouts.
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
    // ExpenseFormView.vue:386-419 — member chips under a "Paid by" label.
    // Scope to that section so the identically-shaped "Split with" chips
    // are not matched. The button label now shows only the first word of
    // the display name (plus the avatar letter), so match on the first word.
    const firstWord = displayName.trim().split(/\s+/)[0];
    await this.page
        .getByText('Paid by', { exact: true })
        .locator('..')
        .getByRole('button', { name: new RegExp(firstWord) })
        .click();
  }

  private splitMemberButton(displayName: string) {
    // ExpenseFormView.vue:424-459 — toggle chips under a "Split with" label.
    // The button label now shows only the first word of the display name
    // (plus the avatar letter), so match on the first word.
    const firstWord = displayName.trim().split(/\s+/)[0];
    return this.page
        .getByText('Split with', { exact: true })
        .locator('..')
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
    // GroupDetailView.vue — the expense row structure:
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
    const flexContainer = descriptionEl.locator('..').locator('..');
    await expect(flexContainer.getByText(`Paid by ${opts.paidByName}`)).toBeVisible();
    await expect(flexContainer.getByText(`\u20AC${parseFloat(opts.amount).toFixed(2)}`)).toBeVisible();
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
    // GroupDetailView.vue — the settlement row is the same shape as expense
    // rows but the description is the literal "Settlement" and the subtitle
    // is `«payer» paid «payee»`.
    const descriptionEl = this.page.getByText('Settlement', { exact: true });
    const flexContainer = descriptionEl.locator('..').locator('..');
    await expect(flexContainer.getByText(`${opts.payerName} paid ${opts.payeeName}`)).toBeVisible();
    await expect(flexContainer.getByText(`\u20AC${parseFloat(opts.amount).toFixed(2)}`)).toBeVisible();
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
