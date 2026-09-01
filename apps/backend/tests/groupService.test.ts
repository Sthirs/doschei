/**
 * Characterization tests for GroupService — pins CURRENT behavior exactly,
 * ahead of the module-split refactor (plan todo 17). These tests exist so
 * a later split can prove it changed nothing; they intentionally lock in
 * quirks as well as intended behavior (see notes below).
 *
 * Mocking strategy: mirrors `tests/oauth/oauth-service.test.ts` — replace
 * `../src/db/data-source` with an in-memory fake dispatched by
 * `entity.name` (Group/Expense/User/ExpenseSplit/Invitation), using plain
 * `vi.fn()` repository methods configured per test via
 * `mockResolvedValueOnce`. Chainable query-builder methods
 * (`innerJoin`/`leftJoinAndSelect`/`where`/`orderBy`) use `mockReturnThis()`
 * re-armed in `beforeEach` after `vi.clearAllMocks()`.
 *
 * `expenseRepository.save` stores whatever it's given and
 * `expenseRepository.findOne` ("reload after save") just returns that same
 * object — this lets the REAL `computeAllocatedAmounts` / `aggregateBalance`
 * production code run unmocked, so the pinned cent arrays and balance
 * totals are genuinely derived from production math, not re-implemented in
 * the test.
 *
 * `decimal` columns (amount / shareValue / computedAmount) are modeled as
 * STRINGS in fixtures (e.g. `'30.00'`), matching how pg + TypeORM actually
 * return `decimal` columns — `serializeExpense`'s `Number(...)` calls exist
 * precisely because of this, so using strings here is a faithful pin, not
 * an artificial detail.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ALICE = {
  id: 'user-alice',
  displayName: 'Alice',
  email: 'alice@test.local',
  imageUrl: null as string | null,
};
const BOB = {
  id: 'user-bob',
  displayName: 'Bob',
  email: 'bob@test.local',
  imageUrl: null as string | null,
};
const CAROL = {
  id: 'user-carol',
  displayName: 'Carol',
  email: 'carol@test.local',
  imageUrl: null as string | null,
};

// Deliberately NOT alphabetical — proves `startExpensesCsv`'s member
// ordering is a real re-sort by displayName, not a pass-through of
// `group.members` array order.
const GROUP = {
  id: 'group-1',
  name: 'Weekend Trip',
  imageUrl: null as string | null,
  members: [BOB, CAROL, ALICE],
};

const groupQueryBuilder = {
  innerJoin: vi.fn(),
  leftJoinAndSelect: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getOne: vi.fn(),
  getMany: vi.fn(),
};

const groupRepo = {
  createQueryBuilder: vi.fn(() => groupQueryBuilder),
  create: vi.fn((data: Record<string, unknown>) => ({
    id: 'group-created-id',
    imageUrl: null,
    ...data,
  })),
  save: vi.fn(async (g: unknown) => g),
};

let lastSavedExpense: Record<string, unknown> | undefined;

const expenseRepo = {
  find: vi.fn(),
  create: vi.fn((data: Record<string, unknown>) => ({
    id: 'expense-created-id',
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    kind: 'EXPENSE', // matches the `Expense.kind` column's DB default; only
    // settlement creation passes an explicit `kind: 'SETTLEMENT'` override.
    ...data,
  })),
  save: vi.fn(async (e: Record<string, unknown>) => {
    lastSavedExpense = e;
    return e;
  }),
  findOne: vi.fn(async () => lastSavedExpense),
  remove: vi.fn(async (e: unknown) => e),
};

let splitIdCounter = 0;
const splitRepo = {
  create: vi.fn((data: Record<string, unknown>) => ({
    id: `split-${(splitIdCounter += 1)}`,
    ...data,
  })),
};

const userRepo = {
  findOne: vi.fn(),
};

const invitationRepo = {
  find: vi.fn(async () => []),
};

function dispatchRepo(entity: { name: string }) {
  switch (entity.name) {
    case 'Group':
      return groupRepo;
    case 'Expense':
      return expenseRepo;
    case 'ExpenseSplit':
      return splitRepo;
    case 'User':
      return userRepo;
    case 'Invitation':
      return invitationRepo;
    default:
      throw new Error(
        `Unmocked entity in groupService.test.ts: ${entity.name}`,
      );
  }
}

vi.mock('../src/db/data-source', () => ({
  AppDataSource: {
    getRepository: dispatchRepo,
    transaction: vi.fn(
      async (
        cb: (manager: {
          getRepository: typeof dispatchRepo;
        }) => Promise<unknown>,
      ) => cb({ getRepository: dispatchRepo }),
    ),
  },
  initializeDatabase: vi.fn(async () => undefined),
}));

// Import AFTER the mock so GroupService receives the stubbed data-source.
import { GroupService } from '../src/services/groupService';

describe('GroupService (characterization — pins current behavior pre-split)', () => {
  let service: GroupService;

  beforeEach(() => {
    vi.clearAllMocks();
    lastSavedExpense = undefined;
    splitIdCounter = 0;
    groupQueryBuilder.innerJoin.mockReturnThis();
    groupQueryBuilder.leftJoinAndSelect.mockReturnThis();
    groupQueryBuilder.where.mockReturnThis();
    groupQueryBuilder.orderBy.mockReturnThis();
    invitationRepo.find.mockResolvedValue([]);
    service = new GroupService();
  });

  describe('createExpenseForGroup — EQUAL split remainder allocation (pin a)', () => {
    it('distributes the leftover cent to the FIRST entry of the splits INPUT array, not group.members order or alphabetical order', async () => {
      groupQueryBuilder.getOne.mockResolvedValueOnce(GROUP);

      // Input order is [Bob, Carol, Alice] — scrambled relative to both
      // group.members ([Bob, Carol, Alice] here too, coincidentally
      // matching) AND alphabetical order, so the pin is unambiguous: the
      // remainder cent goes to index 0 of the SPLITS INPUT, i.e. Bob.
      const splitsInput = [
        { userId: BOB.id, shareType: 'EQUAL', shareValue: 0 },
        { userId: CAROL.id, shareType: 'EQUAL', shareValue: 0 },
        { userId: ALICE.id, shareType: 'EQUAL', shareValue: 0 },
      ];

      const result = await service.createExpenseForGroup(
        GROUP.id,
        'Dinner',
        10.0,
        '2026-02-01',
        'food',
        ALICE.id,
        BOB.id,
        splitsInput,
      );

      // amountCents=1000, n=3 → base=333, remainder=1 → index 0 (Bob) gets +1.
      const centsInParticipantOrder = result.splits.map((s) =>
        Math.round(s.computedAmount * 100),
      );
      expect(centsInParticipantOrder).toEqual([334, 333, 333]);
      expect(result.splits.map((s) => s.userId)).toEqual([
        BOB.id,
        CAROL.id,
        ALICE.id,
      ]);

      const totalCents = centsInParticipantOrder.reduce((acc, c) => acc + c, 0);
      expect(totalCents).toBe(1000);
    });

    it('is order-sensitive: reordering the splits input to [Alice, Bob, Carol] moves the extra cent to Alice', async () => {
      groupQueryBuilder.getOne.mockResolvedValueOnce(GROUP);

      const splitsInput = [
        { userId: ALICE.id, shareType: 'EQUAL', shareValue: 0 },
        { userId: BOB.id, shareType: 'EQUAL', shareValue: 0 },
        { userId: CAROL.id, shareType: 'EQUAL', shareValue: 0 },
      ];

      const result = await service.createExpenseForGroup(
        GROUP.id,
        'Dinner',
        10.0,
        '2026-02-01',
        'food',
        ALICE.id,
        BOB.id,
        splitsInput,
      );

      const centsInParticipantOrder = result.splits.map((s) =>
        Math.round(s.computedAmount * 100),
      );
      expect(centsInParticipantOrder).toEqual([334, 333, 333]);
      expect(result.splits.map((s) => s.userId)).toEqual([
        ALICE.id,
        BOB.id,
        CAROL.id,
      ]);
    });
  });

  describe('computeBalance (via getGroupByIdForUser) — zero-sum invariant across a mixed EXPENSE + SETTLEMENT ledger (pin b)', () => {
    it('sums perUser cents to exactly netForCurrentUser, applying the same formula to EXPENSE and SETTLEMENT kinds', async () => {
      groupQueryBuilder.getOne.mockResolvedValueOnce(GROUP);

      const expenseEntity = {
        id: 'exp-1',
        description: 'Groceries',
        amount: '30.00',
        category: 'food',
        kind: 'EXPENSE',
        date: '2026-02-01',
        createdAt: new Date('2026-02-01T09:00:00.000Z'),
        paidBy: ALICE,
        splits: [
          {
            user: BOB,
            shareType: 'PERCENT',
            shareValue: '50.00',
            computedAmount: '15.00',
          },
          {
            user: ALICE,
            shareType: 'PERCENT',
            shareValue: '50.00',
            computedAmount: '15.00',
          },
        ],
      };
      const settlementEntity = {
        id: 'exp-2',
        description: 'Settlement',
        amount: '5.00',
        category: 'general',
        kind: 'SETTLEMENT',
        date: '2026-02-02',
        createdAt: new Date('2026-02-02T09:00:00.000Z'),
        paidBy: BOB,
        splits: [
          {
            user: ALICE,
            shareType: 'FIXED',
            shareValue: '5.00',
            computedAmount: '5.00',
          },
        ],
      };

      expenseRepo.find.mockResolvedValueOnce([expenseEntity, settlementEntity]);

      const result = await service.getGroupByIdForUser(GROUP.id, ALICE.id);

      expect(result).not.toBeNull();
      const balance = result!.balance;

      // Expense: Alice paid 30, Bob's 15 share → Bob owes Alice 15 (net += 15).
      // Settlement: Bob paid Alice 5.00 → reduces what Bob owes Alice (net -= 5).
      // Net = 10, perUser[Bob] = 10 — chosen deliberately non-cancelling so
      // the invariant isn't trivially satisfied by both sides being zero.
      expect(balance.netForCurrentUser).toBe(10);
      const sumOfPerUser = balance.perUser.reduce(
        (acc, entry) => acc + entry.netForCurrentUser,
        0,
      );
      expect(sumOfPerUser).toBe(balance.netForCurrentUser);
      expect(balance.perUser).toEqual([
        { userId: BOB.id, displayName: BOB.displayName, netForCurrentUser: 10 },
      ]);
    });
  });

  describe('startExpensesCsv — header and row order (pin c)', () => {
    it('emits the header row with members re-sorted alphabetically by displayName, and rows in the SAME order returned by the repository (no re-sort)', async () => {
      groupQueryBuilder.getOne.mockResolvedValueOnce(GROUP);

      const groceries = {
        id: 'exp-1',
        description: 'Groceries',
        amount: '12.00',
        category: 'food',
        date: '2026-02-05',
        paidBy: ALICE,
        splits: [
          { user: BOB, computedAmount: '6.00' },
          { user: ALICE, computedAmount: '6.00' },
        ],
      };
      const taxi = {
        id: 'exp-2',
        description: 'Taxi',
        amount: '8.00',
        category: 'transport',
        date: '2026-02-10',
        paidBy: BOB,
        splits: [{ user: ALICE, computedAmount: '8.00' }],
      };

      // Deliberately return Groceries (2026-02-05) before Taxi (2026-02-10)
      // — the same order the real ASC-by-date query would produce — to
      // pin that the CSV rows are a pure pass-through of query order.
      expenseRepo.find.mockResolvedValueOnce([groceries, taxi]);

      const { headers, rows } = await service.startExpensesCsv(
        GROUP.id,
        ALICE.id,
        '2026-02',
      );

      expect(headers.contentType).toBe('text/csv; charset=utf-8');

      const emitted: string[] = [];
      for await (const row of rows) {
        emitted.push(row);
      }

      expect(emitted).toHaveLength(3); // header + 2 rows
      expect(emitted[0]).toBe(
        'date,description,category,expense,currency,Alice,Bob,Carol\r\n',
      );
      expect(emitted[1]).toBe(
        '2026-02-05,Groceries,food,12.00,EUR,6.00,-6.00,0.00\r\n',
      );
      expect(emitted[2]).toBe(
        '2026-02-10,Taxi,transport,8.00,EUR,-8.00,8.00,0.00\r\n',
      );
    });
  });

  describe('serializeGroup / serializeExpense — serialization shape (pin d)', () => {
    it('serializeGroup (via createGroupForUser): field names and types, including the imageUrl-per-member quirk not declared in the SerializedGroup type', async () => {
      userRepo.findOne.mockResolvedValueOnce(ALICE);

      const result = await service.createGroupForUser(ALICE.id, 'New Group');

      expect(Object.keys(result).sort()).toEqual(
        [
          'id',
          'name',
          'imageUrl',
          'memberCount',
          'members',
          'netForCurrentUser',
        ].sort(),
      );
      expect(typeof result.id).toBe('string');
      expect(typeof result.name).toBe('string');
      expect(result.imageUrl).toBeNull();
      expect(result.memberCount).toBe(1);
      expect(result.netForCurrentUser).toBe(0);

      // Known quirk (flagged, not fixed — see problems.md): each serialized
      // member includes `imageUrl`, a field the `SerializedGroup` TS type
      // does not declare on its `members` entries (todo 7's learnings
      // already documented this gap on the read path; this pins it on the
      // write path too).
      expect(result.members).toEqual([
        {
          id: ALICE.id,
          displayName: ALICE.displayName,
          email: ALICE.email,
          imageUrl: ALICE.imageUrl,
        },
      ]);
    });

    it('serializeExpense (via createExpenseForGroup): field names and types', async () => {
      groupQueryBuilder.getOne.mockResolvedValueOnce(GROUP);

      const result = await service.createExpenseForGroup(
        GROUP.id,
        'Dinner',
        10.0,
        '2026-02-01',
        'food',
        ALICE.id,
        BOB.id,
        [
          { userId: BOB.id, shareType: 'EQUAL', shareValue: 0 },
          { userId: ALICE.id, shareType: 'EQUAL', shareValue: 0 },
        ],
      );

      expect(Object.keys(result).sort()).toEqual(
        [
          'id',
          'description',
          'amount',
          'category',
          'paidByUserId',
          'paidByName',
          'date',
          'createdAt',
          'kind',
          'settledWithUserId',
          'settledWithName',
          'splits',
        ].sort(),
      );
      expect(typeof result.amount).toBe('number');
      expect(result.kind).toBe('EXPENSE');
      // Non-SETTLEMENT expenses always null out the settledWith* fields,
      // regardless of how many splits exist.
      expect(result.settledWithUserId).toBeNull();
      expect(result.settledWithName).toBeNull();
      expect(typeof result.createdAt).toBe('string'); // ISO string, not a Date instance
      expect(result.splits[0]).toEqual({
        userId: expect.any(String),
        displayName: expect.any(String),
        shareType: 'EQUAL',
        shareValue: expect.any(Number),
        computedAmount: expect.any(Number),
      });
    });

    it('serializeExpense: SETTLEMENT kind exposes settledWithUserId/Name from splits[0], not from paidBy', async () => {
      groupQueryBuilder.getOne.mockResolvedValueOnce(GROUP);

      const result = await service.createSettlementForGroup(
        GROUP.id,
        ALICE.id,
        {
          paidByUserId: ALICE.id,
          paidToUserId: BOB.id,
          amount: 12.5,
          date: '2026-02-03',
        },
      );

      expect(result.kind).toBe('SETTLEMENT');
      expect(result.paidByUserId).toBe(ALICE.id);
      expect(result.settledWithUserId).toBe(BOB.id);
      expect(result.settledWithName).toBe(BOB.displayName);
      expect(result.splits).toEqual([
        {
          userId: BOB.id,
          displayName: BOB.displayName,
          shareType: 'FIXED',
          shareValue: 12.5,
          computedAmount: 12.5,
        },
      ]);
    });
  });
});
