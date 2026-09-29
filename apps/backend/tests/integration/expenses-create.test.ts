import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';
import {
  bearer,
  createGroupWithMembers,
  createSoloGroup,
  equalSplits,
  fetchGroup,
  newUser,
  postExpense,
  UNKNOWN_ID,
} from './helpers/groups';

describe('Expenses Endpoints', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  describe('POST /api/groups/:id/expenses', () => {
    it('creates an expense successfully', async () => {
      const user = await registerUser('expense-post-ok');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; category: string; paidByName: string; date: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Dinner',
          amount: 50.5,
          date: '2026-06-01',
          category: 'groceries',
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense).toMatchObject({
        description: 'Dinner',
        amount: 50.5,
        category: 'groceries',
        paidByName: user.body.user.displayName,
        date: '2026-06-01',
      });
      expect(response.body.expense).toHaveProperty('id');
      expect(response.body.expense).toHaveProperty('createdAt');
    });

    it('rejects unauthenticated access', async () => {
      const response = await createJsonRequest<{ message: string }>('/api/groups/123/expenses', {
        method: 'POST',
        body: JSON.stringify({ description: 'Dinner', amount: 50.5 }),
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/missing bearer token/i);
    });

    it('returns 400 for invalid data', async () => {
      const user = await registerUser('expense-post-invalid');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-group-invalid') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: '', amount: -10 }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Description is required/i);
    });

    it('returns 400 for an invalid category', async () => {
      const user = await registerUser('expense-post-invalid-category');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-group-invalid-category') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: 'Dinner', amount: 20, category: 'not-a-real-category' }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Category must be one of the supported values/i);
    });

    it('defaults the expense date to today when omitted', async () => {
      const user = await registerUser('expense-post-default-date');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-group-default-date') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ expense: { date: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Breakfast',
          amount: 12.5,
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.date).toBe(new Date().toISOString().slice(0, 10));
    });

    it('attributes the expense to the paidByUserId member when provided', async () => {
      const author = await registerUser('expense-paidby-author');
      const otherMember = await registerUser('expense-paidby-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-paidby-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ email: otherMember.body.user.email }),
      });
      await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherMember.body.token}` },
      });

      const response = await createJsonRequest<{ expense: { id: string; paidByName: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Lunch paid by other',
          amount: 30,
          paidByUserId: otherMember.body.user.id,
          splits: [{ userId: otherMember.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.paidByName).toBe(otherMember.body.user.displayName);
    });

    it('rejects a paidByUserId that is not a group member', async () => {
      const author = await registerUser('expense-paidby-reject-author');
      const outsider = await registerUser('expense-paidby-reject-outsider');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-paidby-reject-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Forbidden attribution',
          amount: 20,
          paidByUserId: outsider.body.user.id,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/not a member of this group/i);
    });
  });

  describe('PATCH /api/groups/:id/expenses/:expenseId', () => {
    it('updates an expense successfully', async () => {
      const user = await registerUser('expense-patch-ok');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-patch-group') }),
      });
      const groupId = groupRes.body.group.id;

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Lunch',
          amount: 20,
          category: 'general',
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; category: string; paidByName: string; date: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Lunch updated', amount: 25.5, date: '2026-06-03', category: 'taxi',
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense).toMatchObject({
        description: 'Lunch updated',
        amount: 25.5,
        category: 'taxi',
        paidByName: user.body.user.displayName,
        date: '2026-06-03',
      });
      expect(response.body.expense).toHaveProperty('createdAt');
    });

    it('allows update from non-author member', async () => {
      const author = await registerUser('expense-patch-author');
      const otherUser = await registerUser('expense-patch-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-patch-group-auth') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ email: otherUser.body.user.email }),
      });
      await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
      });

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Drinks',
          amount: 15,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; paidByName: string; date: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
        body: JSON.stringify({
        amount: 20, date: '2026-06-05',
        splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
      }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense).toMatchObject({
        amount: 20,
        paidByName: author.body.user.displayName,
        date: '2026-06-05',
      });
    });

    it('returns 400 for invalid data', async () => {
      const user = await registerUser('expense-patch-invalid');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-patch-group-invalid') }),
      });
      const groupId = groupRes.body.group.id;

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Dinner',
          amount: 50,
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: '', amount: -5 }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Description must be a non-empty string/i);
    });

    it('returns 400 for an invalid category update', async () => {
      const user = await registerUser('expense-patch-invalid-category');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-patch-group-invalid-category') }),
      });
      const groupId = groupRes.body.group.id;

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Dinner',
          amount: 50,
          category: 'general',
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ category: 'not-a-real-category' }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Category must be one of the supported values/i);
    });

    it('changes the payer when paidByUserId refers to another group member', async () => {
      const author = await registerUser('expense-patch-paidby-author');
      const otherMember = await registerUser('expense-patch-paidby-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-patch-paidby-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ email: otherMember.body.user.email }),
      });
      await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherMember.body.token}` },
      });

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Groceries',
          amount: 40,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; paidByUserId: string; paidByName: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          paidByUserId: otherMember.body.user.id,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense.paidByUserId).toBe(otherMember.body.user.id);
      expect(response.body.expense.paidByName).toBe(otherMember.body.user.displayName);
    });

    it('rejects a paidByUserId that is not a group member', async () => {
      const author = await registerUser('expense-patch-paidby-reject-author');
      const outsider = await registerUser('expense-patch-paidby-reject-outsider');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-patch-paidby-reject-group') }),
      });
      const groupId = groupRes.body.group.id;

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Concert',
          amount: 80,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          paidByUserId: outsider.body.user.id,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/not a member of this group/i);
    });
  });

  describe('DELETE /api/groups/:id/expenses/:expenseId', () => {
    it('deletes an expense successfully', async () => {
      const user = await registerUser('expense-del-ok');
      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-del-group') }),
      });
      const groupId = groupRes.body.group.id;

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({
          description: 'Snacks',
          amount: 10,
          splits: [{ userId: user.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; paidByName: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.body.token}` },
      });

      expect(response.status).toBe(204);

      // Verify deletion
      const groupVerifyRes = await createJsonRequest<{ group: { expenses: unknown[] } }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${user.body.token}` },
      });
      expect(groupVerifyRes.body.group.expenses).toHaveLength(0);
    });

    it('allows delete from another group member', async () => {
      const author = await registerUser('expense-del-author');
      const otherUser = await registerUser('expense-del-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-del-group-auth') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ email: otherUser.body.user.email }),
      });
      await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
      });

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Tickets',
          amount: 100,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
      });

      expect(response.status).toBe(204);

      const groupVerifyRes = await createJsonRequest<{ group: { expenses: unknown[] } }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${author.body.token}` },
      });
      expect(groupVerifyRes.body.group.expenses).toHaveLength(0);
    });
  });

  describe('access control and group scoping', () => {
    it('returns 404 when a non-member creates, updates, or deletes an expense', async () => {
      const { groupId, members } = await createGroupWithMembers('expense-nonmember', 1);
      const outsider = await newUser('expense-nonmember-outsider');
      const created = await postExpense(members[0].token, groupId, { amount: 20, splits: equalSplits(members) });
      const expenseId = created.body.expense.id;

      const createRes = await postExpense(outsider.token, groupId, { amount: 20, splits: equalSplits(members) });
      expect(createRes.status).toBe(404);

      const patchRes = await createJsonRequest(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: bearer(outsider.token),
        body: JSON.stringify({ description: 'hijacked', splits: equalSplits(members) }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: bearer(outsider.token),
      });
      expect(deleteRes.status).toBe(404);

      const group = await fetchGroup(members[0].token, groupId);
      expect(group.expenses).toHaveLength(1);
      expect(group.expenses[0]).toMatchObject({ id: expenseId, description: 'Test expense' });
    });

    it('returns 401 for unauthenticated PATCH and DELETE', async () => {
      const patchRes = await createJsonRequest(`/api/groups/${UNKNOWN_ID}/expenses/${UNKNOWN_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ description: 'x' }),
      });
      expect(patchRes.status).toBe(401);

      const deleteRes = await createJsonRequest(`/api/groups/${UNKNOWN_ID}/expenses/${UNKNOWN_ID}`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(401);
    });

    it('returns 404 for an unknown expense id on PATCH and DELETE', async () => {
      const { groupId, owner } = await createSoloGroup('expense-unknown');
      const splits = equalSplits([owner]);

      const patchRes = await createJsonRequest(`/api/groups/${groupId}/expenses/${UNKNOWN_ID}`, {
        method: 'PATCH',
        headers: bearer(owner.token),
        body: JSON.stringify({ description: 'x', splits }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${groupId}/expenses/${UNKNOWN_ID}`, {
        method: 'DELETE',
        headers: bearer(owner.token),
      });
      expect(deleteRes.status).toBe(404);
    });

    it("cannot reach another group's expense through a group the caller belongs to", async () => {
      const victim = await createSoloGroup('expense-xgroup-victim');
      const attacker = await createSoloGroup('expense-xgroup-attacker');
      const created = await postExpense(victim.owner.token, victim.groupId, {
        description: 'Victim rent',
        amount: 500,
        splits: equalSplits([victim.owner]),
      });
      const expenseId = created.body.expense.id;

      const patchRes = await createJsonRequest(`/api/groups/${attacker.groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: bearer(attacker.owner.token),
        body: JSON.stringify({ description: 'hijacked', splits: equalSplits([attacker.owner]) }),
      });
      expect(patchRes.status).toBe(404);

      const deleteRes = await createJsonRequest(`/api/groups/${attacker.groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: bearer(attacker.owner.token),
      });
      expect(deleteRes.status).toBe(404);

      const group = await fetchGroup(victim.owner.token, victim.groupId);
      expect(group.expenses).toHaveLength(1);
      expect(group.expenses[0]).toMatchObject({ id: expenseId, description: 'Victim rent', amount: 500 });
    });
  });

  describe('amount precision', () => {
    it.each([
      ['more than two decimals', 10.005],
      ['a sub-cent value', 0.001],
      ['more than decimal(10,2) can hold', 100_000_000],
    ])('POST rejects %s with 400 instead of rounding or overflowing', async (_label, amount) => {
      const { groupId, owner } = await createSoloGroup('expense-precision');

      const response = await postExpense(owner.token, groupId, { amount, splits: equalSplits([owner]) });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/at most two decimal places/i);
      expect((await fetchGroup(owner.token, groupId)).expenses).toHaveLength(0);
    });

    it('POST rejects a numeric string amount with 400', async () => {
      const { groupId, owner } = await createSoloGroup('expense-string-amount');

      const response = await postExpense(owner.token, groupId, { amount: '10', splits: equalSplits([owner]) });

      expect(response.status).toBe(400);
    });

    it('accepts the largest amount the ledger column can hold', async () => {
      const { groupId, owner } = await createSoloGroup('expense-max-amount');

      const response = await postExpense(owner.token, groupId, { amount: 99_999_999.99, splits: equalSplits([owner]) });

      expect(response.status).toBe(201);
      expect(response.body.expense.amount).toBe(99_999_999.99);
    });

    it('PATCH rejects an amount with more than two decimals and leaves the expense unchanged', async () => {
      const { groupId, owner } = await createSoloGroup('expense-precision-patch');
      const created = await postExpense(owner.token, groupId, { amount: 12.5, splits: equalSplits([owner]) });

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/expenses/${created.body.expense.id}`,
        {
          method: 'PATCH',
          headers: bearer(owner.token),
          body: JSON.stringify({ amount: 12.505, splits: equalSplits([owner]) }),
        },
      );

      expect(response.status).toBe(400);
      expect((await fetchGroup(owner.token, groupId)).expenses[0].amount).toBe(12.5);
    });
  });

  describe('balance recalculation', () => {
    it('recomputes both members\' balances after an expense is edited and after it is deleted', async () => {
      const { groupId, members } = await createGroupWithMembers('expense-rebalance', 1);
      const [payer, other] = members;
      const created = await postExpense(payer.token, groupId, { amount: 40, splits: equalSplits(members) });
      const expenseId = created.body.expense.id;

      expect((await fetchGroup(payer.token, groupId)).balance.netForCurrentUser).toBe(20);
      expect((await fetchGroup(other.token, groupId)).balance.netForCurrentUser).toBe(-20);

      // Edit: new amount AND the other member becomes the payer.
      const patchRes = await createJsonRequest(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: bearer(other.token),
        body: JSON.stringify({ amount: 30, paidByUserId: other.user.id, splits: equalSplits(members) }),
      });
      expect(patchRes.status).toBe(200);

      const afterEditPayer = await fetchGroup(payer.token, groupId);
      expect(afterEditPayer.balance.netForCurrentUser).toBe(-15);
      expect(afterEditPayer.balance.perUser).toEqual([
        expect.objectContaining({ userId: other.user.id, netForCurrentUser: -15 }),
      ]);
      expect((await fetchGroup(other.token, groupId)).balance.netForCurrentUser).toBe(15);

      const deleteRes = await createJsonRequest(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: bearer(payer.token),
      });
      expect(deleteRes.status).toBe(204);

      const afterDelete = await fetchGroup(payer.token, groupId);
      expect(afterDelete.balance.netForCurrentUser).toBe(0);
      expect(afterDelete.balance.perUser).toEqual([]);
      expect((await fetchGroup(other.token, groupId)).balance.netForCurrentUser).toBe(0);
    });
  });
});
