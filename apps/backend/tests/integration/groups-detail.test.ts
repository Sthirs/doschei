import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';
import { bearer } from './helpers/groups';
import {
  ALICE_NET,
  createLedgerFixture,
  DATA_URL,
  SERIALIZED_EXPENSE_KEYS,
  SERIALIZED_SPLIT_KEYS,
} from './helpers/ledgerFixture';

describe('GET /api/groups/:id', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('returns a group with its details and expenses for an authorized member', async () => {
    const registerResponse = await registerUser('groups-detail');
    const groupName = uniqueValue('vacation-budget');

    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const response = await createJsonRequest<{
      group: {
        id: string;
        name: string;
        imageUrl: string | null;
        memberCount: number;
        members: Array<{ id: string; email: string; displayName: string }>;
        expenses: Array<{ id: string; description: string; amount: number; paidByName: string; createdAt: string }>;
      };
    }>(`/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.group).toMatchObject({
      id: groupId,
      name: groupName,
      imageUrl: null,
      memberCount: 1,
    });
    expect(response.body.group.members).toEqual([
      {
        id: registerResponse.body.user.id,
        email: registerResponse.body.user.email,
        displayName: registerResponse.body.user.displayName,
        imageUrl: null,
      },
    ]);
    expect(response.body.group.expenses).toEqual([]);
  });

  it('rejects unauthenticated access', async () => {
    const registerResponse = await registerUser('groups-detail-unauth');
    const groupName = uniqueValue('secret-group');

    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });

  it('returns 404 for non-existent group', async () => {
    const registerResponse = await registerUser('groups-detail-notfound');
    const fakeGroupId = '00000000-0000-0000-0000-000000000000';

    const response = await createJsonRequest<{ message: string }>(`/api/groups/${fakeGroupId}`, {
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/group not found/i);
  });

  it('rejects access by non-member users', async () => {
    const user1Response = await registerUser('groups-detail-member');
    const user2Response = await registerUser('groups-detail-nonmember');
    const groupName = uniqueValue('exclusive-group');

    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Response.body.token}`,
      },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}`, {
      headers: {
        Authorization: `Bearer ${user2Response.body.token}`,
      },
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/group not found/i);
  });

  describe('with images and a mixed ledger', () => {
    type Detail = {
      id: string;
      imageUrl: string | null;
      members: Array<{ id: string; displayName: string; imageUrl: string | null }>;
      expenses: Array<Record<string, unknown> & {
        id: string;
        description: string;
        kind: string;
        paidByUserId: string;
        paidByName: string;
        settledWithUserId: string | null;
        settledWithName: string | null;
        splits: Array<Record<string, unknown> & { userId: string; displayName: string; shareType: string; computedAmount: number }>;
      }>;
      balance: { netForCurrentUser: number; perUser: Array<{ userId: string; displayName: string; netForCurrentUser: number }> };
      pendingInvitations: Array<{ email: string }>;
    };

    let fixture: Awaited<ReturnType<typeof createLedgerFixture>>;
    let detail: Detail;

    beforeAll(async () => {
      fixture = await createLedgerFixture('groups-detail-ledger');
      const response = await createJsonRequest<{ group: Detail }>(`/api/groups/${fixture.ledgerGroupId}`, {
        headers: bearer(fixture.alice.token),
      });
      expect(response.status).toBe(200);
      detail = response.body.group;
    });

    it('lists expenses newest first (date DESC, then createdAt DESC)', () => {
      expect(detail.expenses.map((e) => e.id)).toEqual(fixture.expectedOrder);
    });

    it('serializes exactly the documented expense and split fields — no image or email leaks', () => {
      for (const expense of detail.expenses) {
        expect(Object.keys(expense).sort()).toEqual(SERIALIZED_EXPENSE_KEYS);
        for (const split of expense.splits) {
          expect(Object.keys(split).sort()).toEqual(SERIALIZED_SPLIT_KEYS);
        }
      }
      expect(JSON.stringify(detail.expenses)).not.toMatch(/data:image|@/);
    });

    it('resolves payer and split display names', () => {
      const { alice, bob } = fixture;
      const fuel = detail.expenses.find((e) => e.description === 'Fuel');

      expect(fuel).toMatchObject({ paidByUserId: bob.user.id, paidByName: bob.user.displayName });
      expect(fuel?.splits.map((s) => [s.userId, s.displayName, s.shareType, s.computedAmount])).toEqual(
        expect.arrayContaining([
          [alice.user.id, alice.user.displayName, 'FIXED', 12.35],
          [bob.user.id, bob.user.displayName, 'FIXED', 7.65],
        ]),
      );
    });

    it('exposes the settlement counterpart from its split', () => {
      const settlement = detail.expenses.find((e) => e.id === fixture.settlementId);

      expect(settlement).toMatchObject({
        kind: 'SETTLEMENT',
        paidByUserId: fixture.bob.user.id,
        paidByName: fixture.bob.user.displayName,
        settledWithUserId: fixture.alice.user.id,
        settledWithName: fixture.alice.user.displayName,
      });
    });

    it('computes the balance per member', () => {
      expect(detail.balance.netForCurrentUser).toBe(ALICE_NET);
      expect(detail.balance.perUser).toEqual([
        { userId: fixture.bob.user.id, displayName: fixture.bob.user.displayName, netForCurrentUser: ALICE_NET },
      ]);
    });

    it('still embeds group and member images and lists pending invitations', () => {
      expect(detail.imageUrl).toMatch(DATA_URL);
      expect(detail.members).toHaveLength(2);
      for (const member of detail.members) {
        expect(member.imageUrl).toMatch(DATA_URL);
      }
      expect(detail.pendingInvitations.map((i) => i.email).sort()).toEqual(
        [fixture.carol.user.email, fixture.invitedEmail].sort(),
      );
    });
  });
});
