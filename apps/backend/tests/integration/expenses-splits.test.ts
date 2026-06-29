import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

const createGroupAndAddMember = async (prefix: string) => {
  const author = await registerUser(prefix);
  const other = await registerUser(`${prefix}-other`);

  const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
    method: 'POST',
    headers: { Authorization: `Bearer ${author.body.token}` },
    body: JSON.stringify({ name: uniqueValue(prefix) }),
  });
  const groupId = groupRes.body.group.id;

  await createJsonRequest(`/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${author.body.token}` },
    body: JSON.stringify({ email: other.body.user.email }),
  });

  return {
    author,
    other,
    groupId,
  };
};

describe('Expense Splits Endpoints', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  describe('POST /api/groups/:id/expenses with splits', () => {
    it('creates an expense with valid PERCENT splits (50/50)', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-percent-ok');

      const response = await createJsonRequest<{
        expense: {
          id: string;
          amount: number;
          paidByUserId: string;
          splits: Array<{ userId: string; displayName: string; shareType: string; shareValue: number; computedAmount: number }>;
        };
      }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Groceries',
          amount: 100,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.amount).toBe(100);
      expect(response.body.expense.paidByUserId).toBe(author.body.user.id);
      expect(response.body.expense.splits).toHaveLength(2);

      const total = response.body.expense.splits.reduce((acc, split) => acc + split.computedAmount, 0);
      expect(total).toBe(100);
    });

    it('creates an expense with FIXED splits summing to the amount', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-fixed-ok');

      const response = await createJsonRequest<{
        expense: { id: string; splits: Array<{ userId: string; displayName: string; shareType: string; shareValue: number; computedAmount: number }> };
      }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Dinner',
          amount: 80,
          splits: [
            { userId: author.body.user.id, shareType: 'FIXED', shareValue: 30 },
            { userId: other.body.user.id, shareType: 'FIXED', shareValue: 50 },
          ],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.splits).toHaveLength(2);

      const byUserId = new Map(response.body.expense.splits.map((split) => [split.userId, split]));
      expect(byUserId.get(author.body.user.id)).toMatchObject({
        shareType: 'FIXED',
        shareValue: 30,
        computedAmount: 30,
        displayName: author.body.user.displayName,
      });
      expect(byUserId.get(other.body.user.id)).toMatchObject({
        shareType: 'FIXED',
        shareValue: 50,
        computedAmount: 50,
        displayName: other.body.user.displayName,
      });
    });

    it('rejects PERCENT splits summing to 99', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-percent-reject');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Lunch',
          amount: 100,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 49 },
          ],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Percentages must sum to 100.');
    });

    it('rejects FIXED splits summing to less than the amount', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-fixed-reject');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Taxi',
          amount: 50,
          splits: [
            { userId: author.body.user.id, shareType: 'FIXED', shareValue: 20 },
            { userId: other.body.user.id, shareType: 'FIXED', shareValue: 20 },
          ],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Fixed amounts must sum to the expense total.');
    });

    it('rejects splits referencing a non-member user', async () => {
      const { author, groupId } = await createGroupAndAddMember('splits-nonmember');
      const outsider = await registerUser('splits-nonmember-outsider');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Coffee',
          amount: 10,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: outsider.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Split user .* is not a member of this group\./);
    });

    it('rejects requests with no splits array', async () => {
      const { author, groupId } = await createGroupAndAddMember('splits-missing');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ description: 'Snack', amount: 5 }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('At least one split is required.');
    });

    it('rejects an empty splits array', async () => {
      const { author, groupId } = await createGroupAndAddMember('splits-empty');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ description: 'Snack', amount: 5, splits: [] }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('At least one split is required.');
    });

    it('rejects mixed shareType (PERCENT + FIXED)', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-mixed');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Snack',
          amount: 50,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'FIXED', shareValue: 50 },
          ],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('All splits must use the same share type.');
    });
  });

  describe('PATCH /api/groups/:id/expenses/:expenseId with splits', () => {
    it('replaces existing splits with new ones', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-patch-replace');

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

      const response = await createJsonRequest<{
        expense: { id: string; splits: Array<{ userId: string; shareType: string; computedAmount: number }> };
      }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense.splits).toHaveLength(2);

      const userIds = response.body.expense.splits.map((split) => split.userId).sort();
      expect(userIds).toEqual([author.body.user.id, other.body.user.id].sort());
    });

    it('rejects an empty splits array on PATCH', async () => {
      const { author, groupId } = await createGroupAndAddMember('splits-patch-empty');

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Snack',
          amount: 10,
          splits: [{ userId: author.body.user.id, shareType: 'PERCENT', shareValue: 100 }],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ splits: [] }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('At least one split is required.');
    });
  });

  describe('GET /api/groups/:id includes splits, paidByUserId, and balance', () => {
    it('returns expenses with paidByUserId and splits, and a balance object', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-get-group');

      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Dinner',
          amount: 30,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${other.body.token}` },
        body: JSON.stringify({
          description: 'Movie tickets',
          amount: 20,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      const response = await createJsonRequest<{
        group: {
          expenses: Array<{
            id: string;
            paidByUserId: string;
            splits: Array<{ userId: string; displayName: string; shareType: string; shareValue: number; computedAmount: number }>;
          }>;
          balance: {
            currentUserId: string;
            currentUserName: string;
            netForCurrentUser: number;
            perUser: Array<{ userId: string; displayName: string; netForCurrentUser: number }>;
          };
        };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${author.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.group.expenses).toHaveLength(2);

      for (const expense of response.body.group.expenses) {
        expect(expense.paidByUserId).toMatch(/^[0-9a-f-]{36}$/);
        expect(expense.splits).toHaveLength(2);
        for (const split of expense.splits) {
          expect(split.displayName.length).toBeGreaterThan(0);
          expect(split.computedAmount).toBeGreaterThan(0);
        }
      }

      expect(response.body.group.balance.currentUserId).toBe(author.body.user.id);
      expect(response.body.group.balance.currentUserName).toBe(author.body.user.displayName);

      // Author paid 30 (split 15/15 with other), other paid 20 (split 10/10 with author).
      // From author's perspective:
      //   author↔other: 15 (other owes) - 10 (author owes) = 5
      expect(response.body.group.balance.netForCurrentUser).toBe(5);

      const perOther = response.body.group.balance.perUser.find((entry) => entry.userId === other.body.user.id);
      expect(perOther).toBeDefined();
      expect(perOther?.netForCurrentUser).toBe(5);

      const sumOfPerUser = response.body.group.balance.perUser.reduce((acc, entry) => acc + entry.netForCurrentUser, 0);
      expect(sumOfPerUser).toBe(response.body.group.balance.netForCurrentUser);
    });

    it('returns an empty perUser when current user has no net balance', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-get-empty-balance');

      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Equal dinner',
          amount: 20,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${other.body.token}` },
        body: JSON.stringify({
          description: 'Equal movie',
          amount: 20,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      const response = await createJsonRequest<{
        group: {
          balance: { netForCurrentUser: number; perUser: Array<{ netForCurrentUser: number }> };
        };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${author.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.group.balance.netForCurrentUser).toBe(0);
      expect(response.body.group.balance.perUser).toEqual([]);
    });
  });

  describe('POST /api/groups/:id/expenses with EQUAL splits', () => {
    it('creates an expense with EQUAL splits for 2 users', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-equal-ok');

      const response = await createJsonRequest<{
        expense: {
          id: string;
          amount: number;
          paidByUserId: string;
          splits: Array<{ userId: string; displayName: string; shareType: string; shareValue: number; computedAmount: number }>;
        };
      }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Groceries',
          amount: 100,
          splits: [
            { userId: author.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: other.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.amount).toBe(100);
      expect(response.body.expense.paidByUserId).toBe(author.body.user.id);
      expect(response.body.expense.splits).toHaveLength(2);

      for (const split of response.body.expense.splits) {
        expect(split.shareType).toBe('EQUAL');
        expect(split.computedAmount).toBeGreaterThan(0);
      }

      const total = response.body.expense.splits.reduce((acc, split) => acc + split.computedAmount, 0);
      expect(total).toBe(100);
    });

    it('creates an expense with EQUAL splits for 3 users (odd amount)', async () => {
      const user1 = await registerUser('splits-equal-3u');
      const user2 = await registerUser('splits-equal-3u-other');
      const user3 = await registerUser('splits-equal-3u-third');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({ name: uniqueValue('splits-equal-3u-group') }),
      });
      const groupId = groupRes.body.group.id;

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({ email: user2.body.user.email }),
      });

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({ email: user3.body.user.email }),
      });

      const response = await createJsonRequest<{
        expense: {
          id: string;
          amount: number;
          splits: Array<{ userId: string; shareType: string; computedAmount: number }>;
        };
      }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({
          description: 'Team lunch',
          amount: 10,
          splits: [
            { userId: user1.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: user2.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: user3.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.amount).toBe(10);
      expect(response.body.expense.splits).toHaveLength(3);

      for (const split of response.body.expense.splits) {
        expect(split.shareType).toBe('EQUAL');
      }

      const total = response.body.expense.splits.reduce((acc, split) => acc + split.computedAmount, 0);
      expect(total).toBe(10);
    });

    it('rejects mixed EQUAL + PERCENT splits', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-equal-mixed');

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Snack',
          amount: 50,
          splits: [
            { userId: author.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('All splits must use the same share type.');
    });

    it('returns computedAmount === 20 for all three users on a 60€ EQUAL split', async () => {
      const user1 = await registerUser('splits-equal-per-split');
      const user2 = await registerUser('splits-equal-per-split-other');
      const user3 = await registerUser('splits-equal-per-split-third');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({ name: uniqueValue('splits-equal-per-split-group') }),
      });
      const groupId = groupRes.body.group.id;

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({ email: user2.body.user.email }),
      });

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({ email: user3.body.user.email }),
      });

      const response = await createJsonRequest<{
        expense: {
          amount: number;
          splits: Array<{ userId: string; shareType: string; computedAmount: number }>;
        };
      }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1.body.token}` },
        body: JSON.stringify({
          description: 'Even dinner',
          amount: 60,
          splits: [
            { userId: user1.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: user2.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: user3.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.amount).toBe(60);
      expect(response.body.expense.splits).toHaveLength(3);

      for (const split of response.body.expense.splits) {
        expect(split.shareType).toBe('EQUAL');
        expect(split.computedAmount).toBe(20);
      }

      const total = response.body.expense.splits.reduce((acc, split) => acc + split.computedAmount, 0);
      expect(total).toBe(60);
    });
  });

  describe('PATCH /api/groups/:id/expenses/:expenseId with EQUAL splits', () => {
    it('replaces PERCENT splits with EQUAL splits', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-patch-equal');

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Groceries',
          amount: 40,
          splits: [
            { userId: author.body.user.id, shareType: 'PERCENT', shareValue: 50 },
            { userId: other.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          ],
        }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{
        expense: { id: string; splits: Array<{ userId: string; shareType: string; shareValue: number; computedAmount: number }> };
      }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          splits: [
            { userId: author.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: other.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense.splits).toHaveLength(2);

      for (const split of response.body.expense.splits) {
        expect(split.shareType).toBe('EQUAL');
      }

      const total = response.body.expense.splits.reduce((acc, split) => acc + split.computedAmount, 0);
      expect(total).toBe(40);
    });
  });

  describe('GET /api/groups/:id with EQUAL expense splits', () => {
    it('returns EQUAL splits in group response', async () => {
      const { author, other, groupId } = await createGroupAndAddMember('splits-get-equal');

      await createJsonRequest(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({
          description: 'Dinner',
          amount: 30,
          splits: [
            { userId: author.body.user.id, shareType: 'EQUAL', shareValue: 0 },
            { userId: other.body.user.id, shareType: 'EQUAL', shareValue: 0 },
          ],
        }),
      });

      const response = await createJsonRequest<{
        group: {
          expenses: Array<{
            id: string;
            paidByUserId: string;
            splits: Array<{ userId: string; displayName: string; shareType: string; shareValue: number; computedAmount: number }>;
          }>;
        };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${author.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.group.expenses).toHaveLength(1);

      const expense = response.body.group.expenses[0];
      expect(expense.splits).toHaveLength(2);

      for (const split of expense.splits) {
        expect(split.shareType).toBe('EQUAL');
        expect(split.computedAmount).toBeGreaterThan(0);
      }

      const total = expense.splits.reduce((acc, split) => acc + split.computedAmount, 0);
      expect(total).toBe(30);
    });
  });
});
