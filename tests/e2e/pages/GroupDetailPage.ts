import { promises as fs } from 'node:fs';

import { expect, type Page } from '@playwright/test';

export class GroupDetailPage {
  // Add Expense trigger — the sticky bottom button reads "+ Add expense"
  // (GroupDetailView.vue:1028-1035); name matching is case-insensitive substring.
  private addExpenseButton = this.page.getByRole('button', { name: 'Add Expense' })
      .or(this.page.getByRole('button', { name: 'Add expense' })).first();

  private categoryPicker = this.page.getByRole('button', { name: /^Category:/ });
  // Description input in both the Add Expense and Edit Expense modals — both now
  // share placeholder="Description" (the datepicker input and the settle-up
  // "Note (optional)" input have different placeholders, so no ambiguity).
  private descriptionInput = this.page.getByPlaceholder('Description');
  private amountInput = this.page.getByLabel('Amount');
  private saveExpenseButton = this.page.getByRole('button', { name: 'Save', exact: true });
  private deleteExpenseButton = this.page.getByRole('button', { name: 'Delete' });
  private confirmDeleteButton = this.page.getByRole('button', { name: 'Confirm' });

  // Settle-up dialog (SettleUpModal.vue:133-137 — role=dialog, aria-label="Settle up").
  // All settle-up locators are scoped inside this dialog so they don't collide with
  // the expense modal's identically-named "Save" / "Delete" / "Confirm" buttons.
  private settleUpDialog = this.page.getByRole('dialog', { name: 'Settle up' });
  // GroupDetailView.vue:644-648 — the "Settle up" trigger button.
  private settleUpButton = this.page.getByRole('button', { name: 'Settle up' });
  // SettleUpModal.vue:181-184 — submit button now reads "+ Record Payment"
  // ("Saving..." while the request is in flight).
  private settleUpSaveButton = this.settleUpDialog.getByRole('button', { name: 'Record Payment' });
  // SettleUpModal.vue:196-203 — only visible in edit mode.
  private settleUpDeleteButton = this.settleUpDialog.getByRole('button', { name: 'Delete' });
  // SettleUpModal.vue:200 — the confirm panel's destructive button now reads
  // "Delete" (the "Delete this payment" trigger is hidden in the confirm state).
  private settleUpConfirmDeleteButton = this.settleUpDialog.getByRole('button', { name: 'Delete', exact: true });

  // Export controls (GroupDetailView.vue — "Export" button next to "Settle up"
  // opens a modal with native Month/Year <select>s and an "Export Expenses"
  // action button).
  // `exact: true` on the trigger so it doesn't match "Exporting…" (in-flight state).
  private exportTriggerButton = this.page.getByRole('button', { name: /^Export$/, exact: true });
  private exportDialog = this.page.getByRole('dialog', { name: 'Export expenses' });
  private exportMonthSelect = this.exportDialog.getByLabel('Month');
  private exportYearSelect = this.exportDialog.getByLabel('Year');
  private exportActionButton = this.exportDialog.getByRole('button', { name: 'Export Expenses' });

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
    // Figma redesign: the Add Expense modal replaced UserPicker with inline
    // member chips under a "Paid by" label. Scope to that section so the chips
    // in the "Split with" section are not matched.
    await this.page
        .getByText('Paid by', { exact: true })
        .locator('..')
        .getByRole('button', { name: displayName })
        .click();
  }

  private splitMemberButton(displayName: string) {
    // Figma redesign: split members are toggle chips under a "Split with" label
    // (previously checkboxes). Scope to that section so the identical "Paid by"
    // chips are not matched.
    return this.page
        .getByText('Split with', { exact: true })
        .locator('..')
        .getByRole('button', { name: displayName });
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
    await this.page.getByRole('button', { name: 'Fixed', exact: true }).click();
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
    // DateTimePicker.vue:64 — trigger has data-test-id="dtp"; clicking opens
    // the bottom sheet (DateTimePicker.vue:70 — role="dialog",
    // aria-label="Select date"). The sheet embeds a v-calendar DatePicker
    // (DateTimePicker.vue:108-118, masks.title="MMMM YYYY") so the month title
    // renders as e.g. "August 2026". Nav arrows are .vc-arrow.vc-prev /
    // .vc-arrow.vc-next (v-calendar v3.1.2 — index.js:6328,6374); day cells
    // are .vc-day-content (role="button"), with out-of-month days flagged via
    // is-not-in-month on their .vc-day parent (index.js:6801).
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
    if (!match) throw new Error(`setDate: invalid format "${yyyyMmDd}"`);
    const targetYear = parseInt(match[1], 10);
    const targetMonth = parseInt(match[2], 10); // 1-12
    const targetDay = parseInt(match[3], 10);

    const monthNames = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];
    // Convert a "MMMM YYYY" title to a comparable month index (year*12+month).
    const titleToIndex = (title: string): number => {
      const m = /^(\w+)\s+(\d{4})$/.exec(title.trim());
      if (!m) return Number.NaN;
      return parseInt(m[2], 10) * 12 + monthNames.indexOf(m[1]);
    };
    const targetTitle = `${monthNames[targetMonth - 1]} ${targetYear}`;
    const targetIndex = titleToIndex(targetTitle);

    // Open the bottom sheet.
    await this.page.locator('[data-test-id="dtp"]').click();
    const dialog = this.page.getByRole('dialog', { name: 'Select date' });
    await expect(dialog).toBeVisible();

    // Navigate to the target month (cap at 40 steps — covers ~3 years).
    for (let i = 0; i < 40; i++) {
      const currentTitle = (await dialog.locator('.vc-title').textContent()) ?? '';
      if (currentTitle.trim() === targetTitle) break;
      if (titleToIndex(currentTitle) > targetIndex) {
        await dialog.locator('.vc-arrow.vc-prev').click();
      } else {
        await dialog.locator('.vc-arrow.vc-next').click();
      }
      await this.page.waitForTimeout(50);
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
    // The redesigned modal uses native Month/Year <select>s (GroupDetailView.vue:802-820)
    // instead of a datepicker. Pick the option for the requested YYYY-MM period.
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
