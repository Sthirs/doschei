import { describe, expect, it } from 'vitest';

import {
  aggregateBalance,
  computeAllocatedAmounts,
  type ParsedSplit,
} from '../src/services/expenseSplitMath';
import { SEED_EXPENSES } from '../src/services/seedService';

const DEMO_EMAIL = 'demo@doschei.local';

const VALID_EXPENSE_CATEGORIES = new Set([
  'games', 'movies', 'music', 'entertainment-other', 'sports', 'dining-out',
  'groceries', 'liquor', 'food-other', 'electronics', 'furniture', 'household-supplies',
  'maintenance', 'mortgage', 'home-other', 'pets', 'rent', 'services', 'childcare',
  'clothing', 'education', 'gifts', 'insurance', 'medical-expenses', 'life-other',
  'taxes', 'bicycle', 'bus-train', 'car', 'gas-fuel', 'hotel', 'transportation-other',
  'parking', 'plane', 'taxi', 'general', 'cleaning', 'electricity', 'heat-gas',
  'utilities-other', 'trash', 'tv-phone-internet', 'water',
]);

const buildEmailToIdMap = (): Map<string, string> => {
  const emails = new Set<string>();
  for (const spec of SEED_EXPENSES) {
    emails.add(spec.paidByEmail);
    for (const email of spec.splitEmails) {
      emails.add(email);
    }
  }

  const emailToId = new Map<string, string>();
  let index = 0;
  for (const email of emails) {
    emailToId.set(email, `user-${index}`);
    index += 1;
  }
  return emailToId;
};

const buildAggregateInputs = (
  specs: typeof SEED_EXPENSES,
  emailToId: Map<string, string>,
) =>
  specs.map((spec) => {
    const parsedSplits: ParsedSplit[] = spec.splitEmails.map((email) => ({
      userId: emailToId.get(email)!,
      shareType: spec.shareType,
      shareValue: 0,
    }));
    const allocated = computeAllocatedAmounts(spec.amount, parsedSplits);
    return {
      paidByUserId: emailToId.get(spec.paidByEmail)!,
      splits: allocated.map((entry) => ({
        userId: entry.userId,
        computedAmount: entry.computedAmount,
      })),
    };
  });

describe('seed expenses', () => {
  const emailToId = buildEmailToIdMap();
  const demoId = emailToId.get(DEMO_EMAIL)!;

  it('seeds exactly 10 expenses', () => {
    expect(SEED_EXPENSES).toHaveLength(10);
  });

  it('has unique descriptions (idempotency guard relies on this)', () => {
    const descriptions = SEED_EXPENSES.map((e) => e.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('only seeds Venice and Palermo groups', () => {
    const groupNames = new Set(SEED_EXPENSES.map((e) => e.groupName));
    expect(groupNames.size).toBe(2);
    expect(groupNames.has('Weekend in Venice')).toBe(true);
    expect(groupNames.has('Holiday in Palermo')).toBe(true);
    expect(groupNames.has('Personal Spending')).toBe(false);
    expect(groupNames.has('Office Lunch')).toBe(false);
  });

  it('seeds 5 expenses in Venice and 5 in Palermo', () => {
    const venice = SEED_EXPENSES.filter((e) => e.groupName === 'Weekend in Venice');
    const palermo = SEED_EXPENSES.filter((e) => e.groupName === 'Holiday in Palermo');
    expect(venice).toHaveLength(5);
    expect(palermo).toHaveLength(5);
  });

  it('all splits sum exactly to the expense amount in cents', () => {
    for (const spec of SEED_EXPENSES) {
      const splits: ParsedSplit[] = spec.splitEmails.map((email) => ({
        userId: emailToId.get(email)!,
        shareType: spec.shareType,
        shareValue: 0,
      }));
      const allocated = computeAllocatedAmounts(spec.amount, splits);
      const sumCents = allocated.reduce(
        (acc, entry) => acc + Math.round(entry.computedAmount * 100),
        0,
      );
      expect(sumCents).toBe(Math.round(spec.amount * 100));
    }
  });

  it('all amounts are clean 2-decimal values', () => {
    for (const spec of SEED_EXPENSES) {
      const cents = Math.round(spec.amount * 100);
      expect(spec.amount).toBe(cents / 100);
    }
  });

  it('all categories are valid', () => {
    for (const spec of SEED_EXPENSES) {
      expect(VALID_EXPENSE_CATEGORIES.has(spec.category)).toBe(true);
    }
  });

  it('all dates are valid ISO YYYY-MM-DD', () => {
    for (const spec of SEED_EXPENSES) {
      expect(/^\d{4}-\d{2}-\d{2}$/.test(spec.date)).toBe(true);
    }
  });

  it('demo is net positive in Venice (owed)', () => {
    const veniceSpecs = SEED_EXPENSES.filter((e) => e.groupName === 'Weekend in Venice');
    const inputs = buildAggregateInputs(veniceSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    expect(result.netForCurrentUser).toBeGreaterThan(0);
    expect(result.netForCurrentUser).toBe(40);
  });

  it('demo is net negative in Palermo (owes)', () => {
    const palermoSpecs = SEED_EXPENSES.filter((e) => e.groupName === 'Holiday in Palermo');
    const inputs = buildAggregateInputs(palermoSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    expect(result.netForCurrentUser).toBeLessThan(0);
    expect(result.netForCurrentUser).toBe(-88);
  });

  it('sum of perUser equals netForCurrentUser in Venice', () => {
    const veniceSpecs = SEED_EXPENSES.filter((e) => e.groupName === 'Weekend in Venice');
    const inputs = buildAggregateInputs(veniceSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    const sumOfPerUser = Array.from(result.perUser.values()).reduce(
      (acc, value) => acc + value,
      0,
    );
    expect(sumOfPerUser).toBe(result.netForCurrentUser);
  });

  it('sum of perUser equals netForCurrentUser in Palermo', () => {
    const palermoSpecs = SEED_EXPENSES.filter((e) => e.groupName === 'Holiday in Palermo');
    const inputs = buildAggregateInputs(palermoSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    const sumOfPerUser = Array.from(result.perUser.values()).reduce(
      (acc, value) => acc + value,
      0,
    );
    expect(sumOfPerUser).toBe(result.netForCurrentUser);
  });
});
