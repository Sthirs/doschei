import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';

import CategoryRecapModal from '@/components/group-detail/CategoryRecapModal.vue';
import { i18n } from '@/i18n';

import type { Expense, ExpenseSplit } from '@/types/group';

const CURRENT_USER = 'user-1';

const split = (userId: string, computedAmount: number): ExpenseSplit => ({
  userId,
  displayName: userId,
  shareType: 'FIXED',
  shareValue: computedAmount,
  computedAmount,
});

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e1',
  kind: 'EXPENSE',
  description: 'Dinner',
  amount: 100,
  category: 'general',
  paidByName: 'Alice',
  paidByUserId: CURRENT_USER,
  settledWithUserId: null,
  settledWithName: null,
  date: '2024-10-10',
  createdAt: '2024-10-10T12:00:00.000Z',
  splits: [split(CURRENT_USER, 50), split('user-2', 50)],
  ...over,
});

// Reproduces the "Group Detail (Category Recap)" mockup: 7 families, 8
// expenses (Home split into two so both figures line up), total €480.00,
// the current user's own share half of it.
const mockupExpenses: Expense[] = [
  expense({ id: 'rent', category: 'rent', amount: 100.2, splits: [split(CURRENT_USER, 50.1), split('user-2', 50.1)] }),
  expense({ id: 'mortgage', category: 'mortgage', amount: 86, splits: [split(CURRENT_USER, 43), split('user-2', 43)] }),
  expense({ id: 'dining-out', category: 'dining-out', amount: 154, splits: [split(CURRENT_USER, 77), split('user-2', 77)] }),
  expense({ id: 'movies', category: 'movies', amount: 48, splits: [split(CURRENT_USER, 24), split('user-2', 24)] }),
  expense({ id: 'taxi', category: 'taxi', amount: 34.8, splits: [split(CURRENT_USER, 17.4), split('user-2', 17.4)] }),
  expense({ id: 'gifts', category: 'gifts', amount: 28.5, splits: [split(CURRENT_USER, 14.25), split('user-2', 14.25)] }),
  expense({ id: 'electricity', category: 'electricity', amount: 16, splits: [split(CURRENT_USER, 8), split('user-2', 8)] }),
  expense({ id: 'general', category: 'general', amount: 12.5, splits: [split(CURRENT_USER, 6.25), split('user-2', 6.25)] }),
];

// Rent moved to September so the "previous month" step has its own figures.
const lastMonthExpense = expense({
  id: 'rent-sept',
  category: 'rent',
  amount: 60,
  date: '2024-09-05',
  createdAt: '2024-09-05T12:00:00.000Z',
  splits: [split(CURRENT_USER, 30), split('user-2', 30)],
});

const mountModal = (expenses: Expense[] = mockupExpenses) =>
  mount(CategoryRecapModal, {
    props: { expenses, currentUserId: CURRENT_USER },
    global: { plugins: [i18n] },
  });

const rowTexts = (wrapper: ReturnType<typeof mountModal>) =>
  wrapper.findAll('[data-testid="category-recap-row"]').map((el) => ({
    family: el.attributes('data-family'),
    text: el.text(),
  }));

describe('CategoryRecapModal', () => {
  beforeEach(() => {
    // Frozen inside October 2024 so the default view is October and the
    // forward arrow sits at its bound.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-10-15T12:00:00.000Z'));
    i18n.global.locale.value = 'en';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all seven families in the same fixed order, matching the design mockup figures', () => {
    const wrapper = mountModal();
    const rows = rowTexts(wrapper);

    // Family order is food-and-drink, transportation, home, life, utilities,
    // entertainment, uncategorized (CATEGORIES_GROUPED) — NOT sorted by amount.
    expect(rows.map((r) => r.family)).toEqual([
      'food-and-drink',
      'transportation',
      'home',
      'life',
      'utilities',
      'entertainment',
      'uncategorized',
    ]);
    expect(rows[2].text).toContain('Home');
    expect(rows[2].text).toContain('€186.20');
    expect(rows[2].text).toContain('38.8%');
    expect(rows[6].text).toContain('Uncategorized');
    expect(rows[6].text).toContain('€12.50');
    expect(rows[6].text).toContain('2.6%');
  });

  it('shows the month total, expense count and the user share in the footer', () => {
    const wrapper = mountModal();
    expect(wrapper.find('[data-testid="category-recap-total"]').text()).toBe(
      '€480.00',
    );
    expect(wrapper.find('[data-testid="category-recap-count"]').text()).toBe(
      '8 expenses',
    );
    expect(wrapper.find('[data-testid="category-recap-share"]').text()).toBe(
      'your share €240.00',
    );
  });

  it('shows the current month by default and disables the forward arrow', () => {
    const wrapper = mountModal();
    expect(wrapper.find('[data-testid="category-recap-month"]').text()).toBe(
      'October 2024',
    );
    expect(
      wrapper.get('[aria-label="Next month"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('steps back one month and shows all seven families, still including those at zero', () => {
    const wrapper = mountModal([...mockupExpenses, lastMonthExpense]);
    return wrapper.get('[aria-label="Previous month"]').trigger('click').then(() => {
      expect(wrapper.find('[data-testid="category-recap-month"]').text()).toBe(
        'September 2024',
      );
      const rows = rowTexts(wrapper);
      expect(rows).toHaveLength(7);
      // home is 3rd in the fixed family order, not first, even though it's the
      // only family with spend this month.
      expect(rows.map((r) => r.family)).toEqual([
        'food-and-drink',
        'transportation',
        'home',
        'life',
        'utilities',
        'entertainment',
        'uncategorized',
      ]);
      expect(rows[2].text).toContain('€60.00');
      expect(rows[2].text).toContain('100.0%');
      for (const row of rows.filter((r) => r.family !== 'home')) {
        expect(row.text).toContain('€0.00');
        expect(row.text).toContain('0.0%');
      }
      expect(
        wrapper.get('[aria-label="Next month"]').attributes('disabled'),
      ).toBeUndefined();
    });
  });

  it('renders all seven families at €0.00 for a month with no spend', () => {
    const wrapper = mountModal([]);
    const rows = rowTexts(wrapper);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.text).toContain('€0.00');
      expect(row.text).toContain('0.0%');
    }
    expect(wrapper.find('[data-testid="category-recap-total"]').text()).toBe(
      '€0.00',
    );
    expect(wrapper.find('[data-testid="category-recap-count"]').text()).toBe(
      'no expenses',
    );
    expect(wrapper.find('[data-testid="category-recap-share"]').text()).toBe(
      'your share €0.00',
    );
  });

  it('excludes settle-up entries from every family and from the total', () => {
    const settlement: Expense = {
      ...mockupExpenses[0],
      id: 'settlement-1',
      kind: 'SETTLEMENT',
      amount: 9999,
      splits: [split('user-2', 9999)],
    };
    const wrapper = mountModal([...mockupExpenses, settlement]);
    expect(wrapper.find('[data-testid="category-recap-total"]').text()).toBe(
      '€480.00',
    );
  });

  it('emits close from the header button', async () => {
    // The scrim itself lives in BottomSheet.vue now (ADR-0027) and is
    // covered there, not here.
    const wrapper = mountModal();

    await wrapper.get('[aria-label="Close category details"]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('translates its chrome into Italian, including the one-expense singular', () => {
    i18n.global.locale.value = 'it';
    const wrapper = mountModal([mockupExpenses[0]]);

    expect(wrapper.text()).toContain('Dettaglio categorie');
    expect(wrapper.text()).toContain('Totale speso');
    expect(wrapper.find('[data-testid="category-recap-month"]').text()).toBe(
      'ottobre 2024',
    );
    // Whitespace before the symbol differs across runtimes (regular space vs
    // U+00A0), so match on substance rather than exact spacing.
    expect(wrapper.find('[data-testid="category-recap-count"]').text()).toBe(
      '1 spesa',
    );
    expect(wrapper.find('[data-testid="category-recap-share"]').text()).toMatch(
      /^la tua quota 50,10\s?€$/,
    );
  });
});
