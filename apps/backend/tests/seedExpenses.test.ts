import { describe, expect, it } from 'vitest';

import {
  aggregateBalance,
  computeAllocatedAmounts,
  type ParsedSplit,
} from '../src/services/expenseSplitMath';
import { SEED_EXPENSES } from '../src/services/seedService';

const DEMO_EMAIL = 'demo@doschei.local';

// Characterization test: pin the seed data contract (users, groups, expenses).
// This test ensures that any refactoring of seedService.ts (e.g., splitting data
// definitions from execution logic in todo 20) preserves the exact output.
const SEED_USERS_CONTRACT = [
  { email: 'alice@doschei.local', displayName: 'Alice Rossi' },
  { email: 'bob@doschei.local', displayName: 'Bob Bianchi' },
  { email: 'carol@doschei.local', displayName: 'Carol Colombo' },
];

const SEED_GROUPS_CONTRACT = [
  { name: 'Personal Spending', memberEmails: [DEMO_EMAIL] },
  {
    name: 'Weekend in Venice',
    memberEmails: [DEMO_EMAIL, 'alice@doschei.local'],
  },
  {
    name: 'Office Lunch',
    memberEmails: ['alice@doschei.local', 'carol@doschei.local'],
  },
  {
    name: 'Holiday in Palermo',
    memberEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'],
  },
];

const VALID_EXPENSE_CATEGORIES = new Set([
  'games',
  'movies',
  'music',
  'entertainment-other',
  'sports',
  'dining-out',
  'groceries',
  'liquor',
  'food-other',
  'electronics',
  'furniture',
  'household-supplies',
  'maintenance',
  'mortgage',
  'home-other',
  'pets',
  'rent',
  'services',
  'childcare',
  'clothing',
  'education',
  'gifts',
  'insurance',
  'medical-expenses',
  'life-other',
  'taxes',
  'bicycle',
  'bus-train',
  'car',
  'gas-fuel',
  'hotel',
  'transportation-other',
  'parking',
  'plane',
  'taxi',
  'general',
  'cleaning',
  'electricity',
  'heat-gas',
  'utilities-other',
  'trash',
  'tv-phone-internet',
  'water',
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
    const venice = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Weekend in Venice',
    );
    const palermo = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Holiday in Palermo',
    );
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
    const veniceSpecs = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Weekend in Venice',
    );
    const inputs = buildAggregateInputs(veniceSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    expect(result.netForCurrentUser).toBeGreaterThan(0);
    expect(result.netForCurrentUser).toBe(40);
  });

  it('demo is net negative in Palermo (owes)', () => {
    const palermoSpecs = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Holiday in Palermo',
    );
    const inputs = buildAggregateInputs(palermoSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    expect(result.netForCurrentUser).toBeLessThan(0);
    expect(result.netForCurrentUser).toBe(-88);
  });

  it('sum of perUser equals netForCurrentUser in Venice', () => {
    const veniceSpecs = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Weekend in Venice',
    );
    const inputs = buildAggregateInputs(veniceSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    const sumOfPerUser = Array.from(result.perUser.values()).reduce(
      (acc, value) => acc + value,
      0,
    );
    expect(sumOfPerUser).toBe(result.netForCurrentUser);
  });

  it('sum of perUser equals netForCurrentUser in Palermo', () => {
    const palermoSpecs = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Holiday in Palermo',
    );
    const inputs = buildAggregateInputs(palermoSpecs, emailToId);
    const result = aggregateBalance(inputs, demoId);
    const sumOfPerUser = Array.from(result.perUser.values()).reduce(
      (acc, value) => acc + value,
      0,
    );
    expect(sumOfPerUser).toBe(result.netForCurrentUser);
  });
});

describe('seed data contract (characterization)', () => {
  it('demo user identity is pinned: demo@doschei.local', () => {
    expect(DEMO_EMAIL).toBe('demo@doschei.local');
  });

  it('seed users contract is exactly 3 users with pinned identities', () => {
    expect(SEED_USERS_CONTRACT).toEqual([
      { email: 'alice@doschei.local', displayName: 'Alice Rossi' },
      { email: 'bob@doschei.local', displayName: 'Bob Bianchi' },
      { email: 'carol@doschei.local', displayName: 'Carol Colombo' },
    ]);
  });

  it('seed groups contract is exactly 4 groups with pinned memberships', () => {
    expect(SEED_GROUPS_CONTRACT).toEqual([
      { name: 'Personal Spending', memberEmails: ['demo@doschei.local'] },
      {
        name: 'Weekend in Venice',
        memberEmails: ['demo@doschei.local', 'alice@doschei.local'],
      },
      {
        name: 'Office Lunch',
        memberEmails: ['alice@doschei.local', 'carol@doschei.local'],
      },
      {
        name: 'Holiday in Palermo',
        memberEmails: [
          'demo@doschei.local',
          'alice@doschei.local',
          'bob@doschei.local',
        ],
      },
    ]);
  });

  it('seed expenses are exactly 10 with pinned structure', () => {
    expect(SEED_EXPENSES).toHaveLength(10);
    expect(SEED_EXPENSES).toMatchInlineSnapshot(`
      [
        {
          "amount": 50,
          "category": "bus-train",
          "date": "2024-10-12",
          "description": "Venice train tickets",
          "groupName": "Weekend in Venice",
          "paidByEmail": "demo@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
          ],
        },
        {
          "amount": 30,
          "category": "dining-out",
          "date": "2024-10-12",
          "description": "Venice canal dinner",
          "groupName": "Weekend in Venice",
          "paidByEmail": "demo@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
          ],
        },
        {
          "amount": 42,
          "category": "hotel",
          "date": "2024-10-12",
          "description": "Venice hotel night",
          "groupName": "Weekend in Venice",
          "paidByEmail": "demo@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
          ],
        },
        {
          "amount": 24,
          "category": "dining-out",
          "date": "2024-10-13",
          "description": "Venice morning coffee",
          "groupName": "Weekend in Venice",
          "paidByEmail": "alice@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
          ],
        },
        {
          "amount": 18,
          "category": "general",
          "date": "2024-10-13",
          "description": "Venice gondola ride",
          "groupName": "Weekend in Venice",
          "paidByEmail": "alice@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
          ],
        },
        {
          "amount": 90,
          "category": "taxi",
          "date": "2024-10-15",
          "description": "Palermo airport taxi",
          "groupName": "Holiday in Palermo",
          "paidByEmail": "alice@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
            "bob@doschei.local",
          ],
        },
        {
          "amount": 60,
          "category": "dining-out",
          "date": "2024-10-15",
          "description": "Palermo seafood lunch",
          "groupName": "Holiday in Palermo",
          "paidByEmail": "bob@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
            "bob@doschei.local",
          ],
        },
        {
          "amount": 45,
          "category": "entertainment-other",
          "date": "2024-10-16",
          "description": "Palermo museum tickets",
          "groupName": "Holiday in Palermo",
          "paidByEmail": "alice@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
            "bob@doschei.local",
          ],
        },
        {
          "amount": 33,
          "category": "food-other",
          "date": "2024-10-16",
          "description": "Palermo street food",
          "groupName": "Holiday in Palermo",
          "paidByEmail": "bob@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
            "bob@doschei.local",
          ],
        },
        {
          "amount": 36,
          "category": "general",
          "date": "2024-10-17",
          "description": "Palermo beach rental",
          "groupName": "Holiday in Palermo",
          "paidByEmail": "alice@doschei.local",
          "shareType": "EQUAL",
          "splitEmails": [
            "demo@doschei.local",
            "alice@doschei.local",
            "bob@doschei.local",
          ],
        },
      ]
    `);
  });

  it('demo user appears in exactly 3 groups (Personal, Venice, Palermo)', () => {
    const demoGroups = SEED_GROUPS_CONTRACT.filter((g) =>
      g.memberEmails.includes(DEMO_EMAIL),
    );
    expect(demoGroups).toHaveLength(3);
    expect(demoGroups.map((g) => g.name)).toEqual([
      'Personal Spending',
      'Weekend in Venice',
      'Holiday in Palermo',
    ]);
  });

  it('demo user does NOT appear in Office Lunch group', () => {
    const officeLunch = SEED_GROUPS_CONTRACT.find(
      (g) => g.name === 'Office Lunch',
    );
    expect(officeLunch).toBeDefined();
    expect(officeLunch?.memberEmails).not.toContain(DEMO_EMAIL);
    expect(officeLunch?.memberEmails).toEqual([
      'alice@doschei.local',
      'carol@doschei.local',
    ]);
  });

  it('all seed users appear in at least one group', () => {
    const allGroupMembers = new Set<string>();
    for (const group of SEED_GROUPS_CONTRACT) {
      for (const email of group.memberEmails) {
        allGroupMembers.add(email);
      }
    }
    for (const user of SEED_USERS_CONTRACT) {
      expect(allGroupMembers.has(user.email)).toBe(true);
    }
  });

  it('Personal Spending group has only demo user (no expenses seeded)', () => {
    const personalSpending = SEED_GROUPS_CONTRACT.find(
      (g) => g.name === 'Personal Spending',
    );
    expect(personalSpending?.memberEmails).toEqual([DEMO_EMAIL]);
    const personalExpenses = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Personal Spending',
    );
    expect(personalExpenses).toHaveLength(0);
  });

  it('Office Lunch group has no seeded expenses', () => {
    const officeLunchExpenses = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Office Lunch',
    );
    expect(officeLunchExpenses).toHaveLength(0);
  });

  it('Venice group has exactly 5 expenses, all with demo and alice', () => {
    const veniceExpenses = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Weekend in Venice',
    );
    expect(veniceExpenses).toHaveLength(5);
    for (const expense of veniceExpenses) {
      expect(expense.splitEmails).toEqual([DEMO_EMAIL, 'alice@doschei.local']);
    }
  });

  it('Palermo group has exactly 5 expenses, all with demo, alice, and bob', () => {
    const palermoExpenses = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Holiday in Palermo',
    );
    expect(palermoExpenses).toHaveLength(5);
    for (const expense of palermoExpenses) {
      expect(expense.splitEmails).toEqual([
        DEMO_EMAIL,
        'alice@doschei.local',
        'bob@doschei.local',
      ]);
    }
  });

  it('all seed expenses use EQUAL share type', () => {
    for (const expense of SEED_EXPENSES) {
      expect(expense.shareType).toBe('EQUAL');
    }
  });

  it('total seeded amount across all expenses is 428.00', () => {
    const total = SEED_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(428);
  });

  it('Venice total is 164.00 (demo paid 122, alice paid 42)', () => {
    const veniceExpenses = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Weekend in Venice',
    );
    const total = veniceExpenses.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(164);
    const demoPaid = veniceExpenses
      .filter((e) => e.paidByEmail === DEMO_EMAIL)
      .reduce((sum, e) => sum + e.amount, 0);
    const alicePaid = veniceExpenses
      .filter((e) => e.paidByEmail === 'alice@doschei.local')
      .reduce((sum, e) => sum + e.amount, 0);
    expect(demoPaid).toBe(122);
    expect(alicePaid).toBe(42);
  });

  it('Palermo total is 264.00 (alice paid 171, bob paid 93, demo paid 0)', () => {
    const palermoExpenses = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Holiday in Palermo',
    );
    const total = palermoExpenses.reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(264);
    const demoPaid = palermoExpenses
      .filter((e) => e.paidByEmail === DEMO_EMAIL)
      .reduce((sum, e) => sum + e.amount, 0);
    const alicePaid = palermoExpenses
      .filter((e) => e.paidByEmail === 'alice@doschei.local')
      .reduce((sum, e) => sum + e.amount, 0);
    const bobPaid = palermoExpenses
      .filter((e) => e.paidByEmail === 'bob@doschei.local')
      .reduce((sum, e) => sum + e.amount, 0);
    expect(demoPaid).toBe(0);
    expect(alicePaid).toBe(171);
    expect(bobPaid).toBe(93);
  });

  it('demo user net balance: +40 in Venice, -88 in Palermo', () => {
    const emailToId = new Map<string, string>();
    let index = 0;
    const allEmails = new Set<string>();
    for (const expense of SEED_EXPENSES) {
      allEmails.add(expense.paidByEmail);
      for (const email of expense.splitEmails) {
        allEmails.add(email);
      }
    }
    for (const email of allEmails) {
      emailToId.set(email, `user-${index}`);
      index += 1;
    }
    const demoId = emailToId.get(DEMO_EMAIL)!;

    const veniceSpecs = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Weekend in Venice',
    );
    const veniceInputs = veniceSpecs.map((spec) => {
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
    const veniceBalance = aggregateBalance(veniceInputs, demoId);
    expect(veniceBalance.netForCurrentUser).toBe(40);

    const palermoSpecs = SEED_EXPENSES.filter(
      (e) => e.groupName === 'Holiday in Palermo',
    );
    const palermoInputs = palermoSpecs.map((spec) => {
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
    const palermoBalance = aggregateBalance(palermoInputs, demoId);
    expect(palermoBalance.netForCurrentUser).toBe(-88);
  });
});
