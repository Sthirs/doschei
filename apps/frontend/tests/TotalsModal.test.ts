import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';

import TotalsModal from '@/components/group-detail/TotalsModal.vue';
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

// One expense per month, shaped so the rendered chart reproduces the design
// mockup exactly: group spend 650 / 1,040 / 790 with a user share of
// 210 / 390 / 190, viewed from October 2024.
const mockupExpenses: Expense[] = [
  ['2024-08-12', 650, 210, 440],
  ['2024-09-12', 1040, 390, 650],
  ['2024-10-12', 790, 190, 600],
].map(([date, amount, mine, theirs], index) => ({
  id: `expense-${index}`,
  kind: 'EXPENSE',
  description: 'Groceries',
  amount: amount as number,
  category: 'general',
  paidByName: 'Alice',
  paidByUserId: CURRENT_USER,
  settledWithUserId: null,
  settledWithName: null,
  date: date as string,
  createdAt: `${date}T12:00:00.000Z`,
  splits: [
    split(CURRENT_USER, mine as number),
    split('user-2', theirs as number),
  ],
}));

const mountModal = (expenses: Expense[] = mockupExpenses) =>
  mount(TotalsModal, {
    props: { expenses, currentUserId: CURRENT_USER },
    global: { plugins: [i18n], stubs: { Teleport: true } },
  });

// Inline `height: NN%` of each matching element, as a number.
const heightPercents = (
  wrapper: ReturnType<typeof mountModal>,
  selector: string,
) =>
  wrapper
    .findAll(selector)
    .map((el) =>
      Number(/height:\s*([\d.]+)%/.exec(el.attributes('style') ?? '')?.[1]),
    );

const textsOf = (wrapper: ReturnType<typeof mountModal>, testId: string) =>
  wrapper.findAll(`[data-testid="${testId}"]`).map((el) => el.text());

describe('TotalsModal', () => {
  beforeEach(() => {
    // Frozen inside October 2024 so the default window is the mockup's
    // Aug–Oct 2024 and the forward arrow sits at its bound.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-10-15T12:00:00.000Z'));
    i18n.global.locale.value = 'en';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the three months of the design mockup by default', () => {
    const wrapper = mountModal();

    expect(wrapper.findAll('[data-testid="totals-bar"]')).toHaveLength(3);
    expect(
      wrapper
        .findAll('[data-testid="totals-bar"]')
        .map((el) => el.attributes('data-month')),
    ).toEqual(['2024-08', '2024-09', '2024-10']);
    expect(textsOf(wrapper, 'totals-bar-group')).toEqual([
      '€650',
      '€1,040',
      '€790',
    ]);
    expect(textsOf(wrapper, 'totals-bar-user')).toEqual([
      '€210',
      '€390',
      '€190',
    ]);
    expect(wrapper.find('[data-testid="totals-range"]').text()).toBe(
      'Aug 2024 – Oct 2024',
    );
    expect(wrapper.find('[data-testid="totals-period-total"]').text()).toBe(
      '€2,480.00',
    );
  });

  it('labels the y axis with the ticks the design shows', () => {
    const wrapper = mountModal();
    const ticks = wrapper.findAll('.font-mono').map((el) => el.text());
    expect(ticks).toEqual(['€1.2k', '€800', '€400', '€0']);
  });

  it('names each month below its bar', () => {
    const wrapper = mountModal();
    expect(wrapper.text()).toContain('Aug');
    expect(wrapper.text()).toContain('Sep');
    expect(wrapper.text()).toContain('Oct');
  });

  it('sizes each bar against the axis maximum and its user segment against the bar', () => {
    const wrapper = mountModal();
    const [aug, sep, oct] = heightPercents(wrapper, '[data-testid="totals-bar"] > div');

    // 650 / 1,040 / 790 against a 1,200 axis.
    expect(aug).toBeCloseTo(54.17, 1);
    expect(sep).toBeCloseTo(86.67, 1);
    expect(oct).toBeCloseTo(65.83, 1);

    const userSegments = heightPercents(
      wrapper,
      '[data-testid="totals-bar"] > div > span:last-child',
    );
    // 210/650, 390/1,040, 190/790 of their own bar.
    expect(userSegments[0]).toBeCloseTo(32.31, 1);
    expect(userSegments[1]).toBeCloseTo(37.5, 1);
    expect(userSegments[2]).toBeCloseTo(24.05, 1);
  });

  it('cannot navigate past the current month', () => {
    const wrapper = mountModal();
    const next = wrapper.get('[aria-label="Next period"]');
    expect(next.attributes('disabled')).toBeDefined();
  });

  it('steps the window back one month at a time', async () => {
    const wrapper = mountModal();

    await wrapper.get('[aria-label="Previous period"]').trigger('click');
    expect(wrapper.find('[data-testid="totals-range"]').text()).toBe(
      'Jul 2024 – Sep 2024',
    );
    expect(textsOf(wrapper, 'totals-bar-group')).toEqual([
      '€0',
      '€650',
      '€1,040',
    ]);
    expect(
      wrapper.get('[aria-label="Next period"]').attributes('disabled'),
    ).toBeUndefined();

    await wrapper.get('[aria-label="Previous period"]').trigger('click');
    expect(wrapper.find('[data-testid="totals-range"]').text()).toBe(
      'Jun 2024 – Aug 2024',
    );
  });

  it('steps forward again up to, but not past, the current month', async () => {
    const wrapper = mountModal();

    await wrapper.get('[aria-label="Previous period"]').trigger('click');
    await wrapper.get('[aria-label="Next period"]').trigger('click');

    expect(wrapper.find('[data-testid="totals-range"]').text()).toBe(
      'Aug 2024 – Oct 2024',
    );
    expect(
      wrapper.get('[aria-label="Next period"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('draws no bar for a month with no spend, keeping its zero label', () => {
    const wrapper = mountModal([mockupExpenses[2]]);

    expect(textsOf(wrapper, 'totals-bar-group')).toEqual(['€0', '€0', '€790']);
    // Only October has a bar body.
    expect(wrapper.findAll('[data-testid="totals-bar"] > div')).toHaveLength(1);
  });

  it('excludes settle-up entries from both totals', () => {
    const settlement: Expense = {
      ...mockupExpenses[2],
      id: 'settlement-1',
      kind: 'SETTLEMENT',
      amount: 500,
      splits: [split('user-2', 500)],
    };
    const wrapper = mountModal([mockupExpenses[2], settlement]);

    expect(textsOf(wrapper, 'totals-bar-group')).toEqual(['€0', '€0', '€790']);
    expect(wrapper.find('[data-testid="totals-period-total"]').text()).toBe(
      '€790.00',
    );
  });

  it('keeps a sliver user segment but drops its unreadable label', () => {
    const wrapper = mountModal([
      {
        ...mockupExpenses[2],
        splits: [split(CURRENT_USER, 1), split('user-2', 789)],
      },
    ]);

    expect(textsOf(wrapper, 'totals-bar-user')).toEqual([]);
    const userSegments = heightPercents(
      wrapper,
      '[data-testid="totals-bar"] > div > span:last-child',
    );
    expect(userSegments[0]).toBeGreaterThan(0);
  });

  it('emits close from the header button and from the scrim', async () => {
    const wrapper = mountModal();

    await wrapper.get('[aria-label="Close totals"]').trigger('click');
    await wrapper.get('.backdrop-blur-\\[2px\\]').trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('translates its chrome into Italian', () => {
    i18n.global.locale.value = 'it';
    const wrapper = mountModal();

    expect(wrapper.text()).toContain('Totali');
    expect(wrapper.text()).toContain('Totale periodo selezionato');
    expect(wrapper.find('[data-testid="totals-range"]').text()).toBe(
      'ago 2024 – ott 2024',
    );
  });
});
