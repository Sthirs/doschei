import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';
import {
  createGroupWithMembers,
  createSoloGroup,
  equalSplits,
  fetchGroup,
  newUser,
  postExpense,
  postSettlement,
  toCents,
  UNKNOWN_ID,
} from './helpers/groups';

type SerializedSplit = {
  userId: string;
  displayName: string;
  shareType: 'PERCENT' | 'FIXED' | 'EQUAL';
  shareValue: number;
  computedAmount: number;
};

type SerializedExpense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  paidByUserId: string;
  paidByName: string;
  date: string;
  createdAt: string;
  kind: 'EXPENSE' | 'SETTLEMENT';
  settledWithUserId: string | null;
  settledWithName: string | null;
  splits: SerializedSplit[];
};

type SerializedBalanceEntry = {
  userId: string;
  displayName: string;
  netForCurrentUser: number;
};

type SerializedBalance = {
  currentUserId: string;
  currentUserName: string;
  netForCurrentUser: number;
  perUser: SerializedBalanceEntry[];
};

type GroupDetail = {
  id: string;
  name: string;
  memberCount: number;
  members: Array<{ id: string; email: string; displayName: string }>;
  expenses: SerializedExpense[];
  balance: SerializedBalance;
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Creates a 2-member group: registers the requester, registers the counterpart,
 * creates the group as the requester, and adds the counterpart as a member.
 * Returns the auth payloads (token + user) for both and the new group's id.
 */
const createTwoMemberGroup = async (prefix: string) => {
  const requester = await registerUser(prefix);
  const counterpart = await registerUser(`${prefix}-counterpart`);

  const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
    method: 'POST',
    headers: bearer(requester.body.token),
    body: JSON.stringify({ name: uniqueValue(`${prefix}-group`) }),
  });
  const groupId = groupRes.body.group.id;

  const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: bearer(requester.body.token),
    body: JSON.stringify({ email: counterpart.body.user.email }),
  });

  await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`, {
    method: 'POST',
    headers: bearer(counterpart.body.token),
  });

  return { requester, counterpart, groupId };
};

/**
 * Creates a 3-member group: registers three users, creates the group as the
 * requester, and adds the other two as members. Required by the PATCH tests,
 * which need a third in-group user to switch the payee to.
 */
const createThreeMemberGroup = async (prefix: string) => {
  const requester = await registerUser(prefix);
  const second = await registerUser(`${prefix}-second`);
  const third = await registerUser(`${prefix}-third`);

  const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
    method: 'POST',
    headers: bearer(requester.body.token),
    body: JSON.stringify({ name: uniqueValue(`${prefix}-group`) }),
  });
  const groupId = groupRes.body.group.id;

  const inviteSecond = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: bearer(requester.body.token),
    body: JSON.stringify({ email: second.body.user.email }),
  });
  await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteSecond.body.invitation.id}/accept`, {
    method: 'POST',
    headers: bearer(second.body.token),
  });

  const inviteThird = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: bearer(requester.body.token),
    body: JSON.stringify({ email: third.body.user.email }),
  });
  await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteThird.body.invitation.id}/accept`, {
    method: 'POST',
    headers: bearer(third.body.token),
  });

  return { requester, second, third, groupId };
};

describe('Settlements Endpoints', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  describe('POST /api/groups/:id/settlements', () => {
    it('returns 201 and the full settlement shape with a single FIXED split', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-post-shape');

      const response = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 10,
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense).toMatchObject({
        kind: 'SETTLEMENT',
        paidByUserId: requester.body.user.id,
        settledWithUserId: counterpart.body.user.id,
        amount: 10,
      });
      expect(response.body.expense).toHaveProperty('id');
      expect(response.body.expense).toHaveProperty('createdAt');
      expect(response.body.expense.splits).toHaveLength(1);
      expect(response.body.expense.splits[0]).toMatchObject({
        shareType: 'FIXED',
        userId: counterpart.body.user.id,
        computedAmount: 10,
      });
    });

    it('defaults paidByUserId to the caller when omitted', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-post-default-payer');

      const response = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidToUserId: counterpart.body.user.id,
          amount: 10,
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.paidByUserId).toBe(requester.body.user.id);
      expect(response.body.expense.settledWithUserId).toBe(counterpart.body.user.id);
    });

    it('nets the balance to zero after settling the full outstanding amount', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-post-nets-to-zero');

      // Expense of 20 paid by requester, split EQUAL — counterpart owes requester €10.
      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          description: 'Dinner',
          amount: 20,
          paidByUserId: requester.body.user.id,
          splits: [
            { userId: requester.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: counterpart.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      const beforeRes = await createJsonRequest<{ group: GroupDetail }>(`/api/groups/${groupId}`, {
        headers: bearer(counterpart.body.token),
      });
      expect(beforeRes.status).toBe(200);
      expect(beforeRes.body.group.balance.netForCurrentUser).toBe(-10);

      // Settle €10 from counterpart to requester.
      const settleRes = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(counterpart.body.token),
        body: JSON.stringify({
          paidByUserId: counterpart.body.user.id,
          paidToUserId: requester.body.user.id,
          amount: 10,
        }),
      });
      expect(settleRes.status).toBe(201);

      const afterRes = await createJsonRequest<{ group: GroupDetail }>(`/api/groups/${groupId}`, {
        headers: bearer(counterpart.body.token),
      });
      expect(afterRes.status).toBe(200);
      expect(afterRes.body.group.balance.netForCurrentUser).toBe(0);
      const perRequester = afterRes.body.group.balance.perUser.find(
        (entry) => entry.userId === requester.body.user.id,
      );
      expect(perRequester).toBeUndefined();
    });

    it('accepts an overpayment and flips the sign of the balance', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-post-overpay');

      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          description: 'Coffee',
          amount: 10,
          paidByUserId: requester.body.user.id,
          splits: [
            { userId: requester.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: counterpart.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      const response = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(counterpart.body.token),
        body: JSON.stringify({
          paidByUserId: counterpart.body.user.id,
          paidToUserId: requester.body.user.id,
          amount: 25,
        }),
      });
      expect(response.status).toBe(201);

      const afterRes = await createJsonRequest<{ group: GroupDetail }>(`/api/groups/${groupId}`, {
        headers: bearer(counterpart.body.token),
      });
      expect(afterRes.status).toBe(200);
      expect(afterRes.body.group.balance.netForCurrentUser).toBeGreaterThan(0);
    });

    it('returns 400 when the payer and the payee are the same person', async () => {
      const { requester, groupId } = await createTwoMemberGroup('settle-post-same-payer');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: requester.body.user.id,
          amount: 10,
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/payer and the payee must be different/i);
    });

    it('returns 400 when the payee is not a member of the group', async () => {
      const { requester, groupId } = await createTwoMemberGroup('settle-post-payee-not-member');
      const outsider = await registerUser('settle-post-payee-outsider');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: outsider.body.user.id,
          amount: 10,
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/not a member of this group/i);
    });

    it('returns 400 for amount 0, amount -5, and a missing amount', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-post-bad-amount');

      const zeroRes = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 0,
        }),
      });
      expect(zeroRes.status).toBe(400);

      const negativeRes = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: -5,
        }),
      });
      expect(negativeRes.status).toBe(400);

      const missingRes = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
        }),
      });
      expect(missingRes.status).toBe(400);
    });

    it('returns 400 for an invalid settlement date', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-post-bad-date');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 10,
          date: '2024-02-30',
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Valid settlement date/i);
    });

    it('returns 401 without a bearer token', async () => {
      const { groupId } = await createTwoMemberGroup('settle-post-no-auth');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({ paidToUserId: '00000000-0000-0000-0000-000000000000', amount: 10 }),
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/missing bearer token/i);
    });

    // Controller maps "...not found..." errors to 404; the membership guard throws "Group not found or you are not a member.", so non-members get 404 per contract T2.1.
    it('returns 404 when a non-member calls the endpoint', async () => {
      const { groupId } = await createTwoMemberGroup('settle-post-non-member');
      const outsider = await registerUser('settle-post-non-member-outsider');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(outsider.body.token),
        body: JSON.stringify({
          paidToUserId: outsider.body.user.id,
          amount: 10,
        }),
      });

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not (a |found).*member/i);
    });
  });

  describe('PATCH /api/groups/:id/settlements/:settlementId', () => {
    it('updates payer, payee, amount and date and rebuilds the single split', async () => {
      const { requester, second, third, groupId } = await createThreeMemberGroup('settle-patch-ok');

      const createRes = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: second.body.user.id,
          amount: 10,
          date: '2026-01-15',
        }),
      });
      const settlementId = createRes.body.expense.id;

      const response = await createJsonRequest<{ expense: SerializedExpense }>(
        `/api/groups/${groupId}/settlements/${settlementId}`,
        {
          method: 'PATCH',
          headers: bearer(requester.body.token),
          body: JSON.stringify({
            paidToUserId: third.body.user.id,
            amount: 20,
            date: '2026-02-20',
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.expense).toMatchObject({
        kind: 'SETTLEMENT',
        paidByUserId: requester.body.user.id,
        settledWithUserId: third.body.user.id,
        amount: 20,
        date: '2026-02-20',
      });
      expect(response.body.expense.splits).toHaveLength(1);
      expect(response.body.expense.splits[0]).toMatchObject({
        shareType: 'FIXED',
        userId: third.body.user.id,
        computedAmount: 20,
      });
    });

    it('returns 400 when the updated payer equals the updated payee', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-patch-same-payer');

      const createRes = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 10,
        }),
      });
      const settlementId = createRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/settlements/${settlementId}`,
        {
          method: 'PATCH',
          headers: bearer(requester.body.token),
          body: JSON.stringify({
            paidByUserId: requester.body.user.id,
            paidToUserId: requester.body.user.id,
          }),
        },
      );

      expect(response.status).toBe(400);
    });

    it('returns 400 when PATCH /api/groups/:id/expenses/:expenseId targets a settlement', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-patch-via-expenses');

      const createRes = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 10,
        }),
      });
      const settlementId = createRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${settlementId}`, {
        method: 'PATCH',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          amount: 20,
          splits: [{ userId: requester.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Settlements must be updated through the settlements endpoint.');
    });
  });

  describe('DELETE /api/groups/:id/settlements/:settlementId', () => {
    it('returns 400 when DELETE /api/groups/:id/expenses/:expenseId targets a settlement', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-delete-via-expenses');

      const createRes = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 10,
        }),
      });
      const settlementId = createRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${settlementId}`, {
        method: 'DELETE',
        headers: bearer(requester.body.token),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Settlements must be deleted through the settlements endpoint.');
    });

    it('returns 204 and removes the settlement from the group detail', async () => {
      const { requester, counterpart, groupId } = await createTwoMemberGroup('settle-delete-ok');

      const createRes = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/settlements`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          paidByUserId: requester.body.user.id,
          paidToUserId: counterpart.body.user.id,
          amount: 10,
        }),
      });
      const settlementId = createRes.body.expense.id;

      const deleteRes = await createJsonRequest<Record<string, never>>(
        `/api/groups/${groupId}/settlements/${settlementId}`,
        {
          method: 'DELETE',
          headers: bearer(requester.body.token),
        },
      );
      expect(deleteRes.status).toBe(204);

      const detailRes = await createJsonRequest<{ group: GroupDetail }>(`/api/groups/${groupId}`, {
        headers: bearer(requester.body.token),
      });
      expect(detailRes.status).toBe(200);
      const found = detailRes.body.group.expenses.find((expense) => expense.id === settlementId);
      expect(found).toBeUndefined();
    });
  });

  describe('regression: regular expenses still work', () => {
    it('POST /api/groups/:id/expenses still returns 201 with kind EXPENSE', async () => {
      const { requester, groupId } = await createTwoMemberGroup('settle-regression-expense');

      const response = await createJsonRequest<{ expense: SerializedExpense }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: bearer(requester.body.token),
        body: JSON.stringify({
          description: 'Lunch',
          amount: 25,
          splits: [{ userId: requester.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense).toMatchObject({
        kind: 'EXPENSE',
        settledWithUserId: null,
        settledWithName: null,
      });
    });
  });

  describe('PATCH and DELETE access control and group scoping', () => {
    it('returns 404 when a non-member updates or deletes a settlement, and leaves it intact', async () => {
      const { groupId, members } = await createGroupWithMembers('settle-nonmember-edit', 1);
      const [payer, payee] = members;
      const outsider = await newUser('settle-nonmember-edit-outsider');
      const created = await postSettlement(payer.token, groupId, { paidToUserId: payee.user.id, amount: 15 });
      const settlementId = created.body.expense.id;

      const patchRes = await createJsonRequest(`/api/groups/${groupId}/settlements/${settlementId}`, {
        method: 'PATCH',
        headers: bearer(outsider.token),
        body: JSON.stringify({ amount: 1 }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${groupId}/settlements/${settlementId}`, {
        method: 'DELETE',
        headers: bearer(outsider.token),
      });
      expect(deleteRes.status).toBe(404);

      const group = await fetchGroup(payer.token, groupId);
      expect(group.expenses).toEqual([expect.objectContaining({ id: settlementId, amount: 15, kind: 'SETTLEMENT' })]);
    });

    it('returns 401 for unauthenticated PATCH and DELETE', async () => {
      const patchRes = await createJsonRequest(`/api/groups/${UNKNOWN_ID}/settlements/${UNKNOWN_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: 1 }),
      });
      expect(patchRes.status).toBe(401);

      const deleteRes = await createJsonRequest(`/api/groups/${UNKNOWN_ID}/settlements/${UNKNOWN_ID}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(401);
    });

    it('returns 404 for an unknown settlement id on PATCH and DELETE', async () => {
      const { groupId, members } = await createGroupWithMembers('settle-unknown', 1);

      const patchRes = await createJsonRequest(`/api/groups/${groupId}/settlements/${UNKNOWN_ID}`, {
        method: 'PATCH',
        headers: bearer(members[0].token),
        body: JSON.stringify({ amount: 1 }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${groupId}/settlements/${UNKNOWN_ID}`, {
        method: 'DELETE',
        headers: bearer(members[0].token),
      });
      expect(deleteRes.status).toBe(404);
    });

    it('returns 404 when the settlements endpoint targets a regular expense', async () => {
      const { groupId, members } = await createGroupWithMembers('settle-targets-expense', 1);
      const expense = await postExpense(members[0].token, groupId, { amount: 30, splits: equalSplits(members) });
      const expenseId = expense.body.expense.id;

      const patchRes = await createJsonRequest(`/api/groups/${groupId}/settlements/${expenseId}`, {
        method: 'PATCH',
        headers: bearer(members[0].token),
        body: JSON.stringify({ amount: 1 }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${groupId}/settlements/${expenseId}`, {
        method: 'DELETE',
        headers: bearer(members[0].token),
      });
      expect(deleteRes.status).toBe(404);

      const group = await fetchGroup(members[0].token, groupId);
      expect(group.expenses).toEqual([expect.objectContaining({ id: expenseId, amount: 30, kind: 'EXPENSE' })]);
    });

    it("cannot reach another group's settlement through a group the caller belongs to", async () => {
      const victim = await createGroupWithMembers('settle-xgroup-victim', 1);
      const attacker = await createSoloGroup('settle-xgroup-attacker');
      const created = await postSettlement(victim.members[0].token, victim.groupId, {
        paidToUserId: victim.members[1].user.id,
        amount: 40,
      });
      const settlementId = created.body.expense.id;

      const patchRes = await createJsonRequest(`/api/groups/${attacker.groupId}/settlements/${settlementId}`, {
        method: 'PATCH',
        headers: bearer(attacker.owner.token),
        body: JSON.stringify({ amount: 1 }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${attacker.groupId}/settlements/${settlementId}`, {
        method: 'DELETE',
        headers: bearer(attacker.owner.token),
      });
      expect(deleteRes.status).toBe(404);

      const group = await fetchGroup(victim.members[0].token, victim.groupId);
      expect(group.expenses).toEqual([expect.objectContaining({ id: settlementId, amount: 40 })]);
    });
  });

  describe('amount precision', () => {
    it.each([
      ['more than two decimals', 10.005],
      ['more than decimal(10,2) can hold', 100_000_000],
    ])('POST rejects %s with 400 instead of rounding or overflowing', async (_label, amount) => {
      const { groupId, members } = await createGroupWithMembers('settle-precision', 1);

      const response = await postSettlement(members[0].token, groupId, { paidToUserId: members[1].user.id, amount });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/at most two decimal places/i);
      expect((await fetchGroup(members[0].token, groupId)).expenses).toHaveLength(0);
    });

    it('PATCH rejects an amount with more than two decimals and keeps the stored amount', async () => {
      const { groupId, members } = await createGroupWithMembers('settle-precision-patch', 1);
      const created = await postSettlement(members[0].token, groupId, { paidToUserId: members[1].user.id, amount: 8 });

      const response = await createJsonRequest(`/api/groups/${groupId}/settlements/${created.body.expense.id}`, {
        method: 'PATCH',
        headers: bearer(members[0].token),
        body: JSON.stringify({ amount: 8.001 }),
      });

      expect(response.status).toBe(400);
      expect((await fetchGroup(members[0].token, groupId)).expenses[0].amount).toBe(8);
    });
  });

  describe('balance invariants across a mixed ledger', () => {
    it('member balances sum to exactly zero and every pairwise entry mirrors its counterpart', async () => {
      const { groupId, members } = await createGroupWithMembers('settle-zero-sum', 2);
      const [alice, bob, carol] = members;

      // EQUAL €10.00 over three: one cent of remainder.
      expect((await postExpense(alice.token, groupId, { amount: 10, splits: equalSplits(members) })).status).toBe(201);
      // PERCENT €7.01 paid by Bob, thirds that do not divide evenly.
      expect(
        (
          await postExpense(bob.token, groupId, {
            amount: 7.01,
            splits: [
              { userId: alice.user.id, shareType: 'PERCENT', shareValue: 33.33 },
              { userId: bob.user.id, shareType: 'PERCENT', shareValue: 33.33 },
              { userId: carol.user.id, shareType: 'PERCENT', shareValue: 33.34 },
            ],
          })
        ).status,
      ).toBe(201);
      // FIXED €5.55 paid by Carol, who is not a participant.
      expect(
        (
          await postExpense(carol.token, groupId, {
            amount: 5.55,
            splits: [
              { userId: alice.user.id, shareType: 'FIXED', shareValue: 2.22 },
              { userId: bob.user.id, shareType: 'FIXED', shareValue: 3.33 },
            ],
          })
        ).status,
      ).toBe(201);
      // A partial settle-up from Bob to Alice.
      expect((await postSettlement(bob.token, groupId, { paidToUserId: alice.user.id, amount: 1.5 })).status).toBe(201);

      const views = await Promise.all(members.map((member) => fetchGroup(member.token, groupId)));
      const nets = views.map((view) => toCents(view.balance.netForCurrentUser));

      expect(nets.reduce((sum, cents) => sum + cents, 0)).toBe(0);
      expect(nets.some((cents) => cents !== 0)).toBe(true);

      for (const [index, view] of views.entries()) {
        const self = members[index].user.id;
        // Each member's net is the sum of their pairwise entries...
        expect(view.balance.perUser.reduce((sum, entry) => sum + toCents(entry.netForCurrentUser), 0)).toBe(nets[index]);
        // ...and each pairwise entry is the exact negative of the other side's.
        for (const entry of view.balance.perUser) {
          const counterpart = views[members.findIndex((member) => member.user.id === entry.userId)];
          const mirror = counterpart.balance.perUser.find((other) => other.userId === self);
          expect(toCents(mirror?.netForCurrentUser ?? 0)).toBe(-toCents(entry.netForCurrentUser));
        }
      }
    });
  });
});
