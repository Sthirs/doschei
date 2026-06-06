import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

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

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; paidByName: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: 'Dinner', amount: 50.5 }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense).toMatchObject({
        description: 'Dinner',
        amount: 50.5,
        paidByName: user.body.user.displayName,
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
        body: JSON.stringify({ description: 'Lunch', amount: 20 }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; paidByName: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: 'Lunch updated', amount: 25.5 }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense).toMatchObject({
        description: 'Lunch updated',
        amount: 25.5,
        paidByName: user.body.user.displayName,
      });
      expect(response.body.expense.createdAt).toBeUndefined();
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

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ email: otherUser.body.user.email }),
      });

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ description: 'Drinks', amount: 15 }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; paidByName: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
        body: JSON.stringify({ amount: 20 }),
      });

      expect(response.status).toBe(200);
      expect(response.body.expense).toMatchObject({
        amount: 20,
        paidByName: author.body.user.displayName,
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
        body: JSON.stringify({ description: 'Dinner', amount: 50 }),
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
        body: JSON.stringify({ description: 'Snacks', amount: 10 }),
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

    it('rejects delete from non-author', async () => {
      const author = await registerUser('expense-del-author');
      const otherUser = await registerUser('expense-del-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-del-group-auth') }),
      });
      const groupId = groupRes.body.group.id;

      const expRes = await createJsonRequest<{ expense: { id: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ description: 'Tickets', amount: 100 }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
      });

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/Group not found or you are not a member/i);
    });
  });
});
