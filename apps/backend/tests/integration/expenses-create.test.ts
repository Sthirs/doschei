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

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; category: string; paidByName: string; date: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: 'Dinner', amount: 50.5, date: '2026-06-01', category: 'groceries' }),
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
        body: JSON.stringify({ description: 'Breakfast', amount: 12.5 }),
      });

      expect(response.status).toBe(201);
      expect(response.body.expense.date).toBe(new Date().toISOString().slice(0, 10));
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
        body: JSON.stringify({ description: 'Lunch', amount: 20, category: 'general' }),
      });
      const expenseId = expRes.body.expense.id;

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; category: string; paidByName: string; date: string; createdAt?: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${user.body.token}` },
        body: JSON.stringify({ description: 'Lunch updated', amount: 25.5, date: '2026-06-03', category: 'taxi' }),
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

      const response = await createJsonRequest<{ expense: { id: string; description: string; amount: number; paidByName: string; date: string } }>(`/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${otherUser.body.token}` },
        body: JSON.stringify({ amount: 20, date: '2026-06-05' }),
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
        body: JSON.stringify({ description: 'Dinner', amount: 50, category: 'general' }),
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

    it('allows delete from another group member', async () => {
      const author = await registerUser('expense-del-author');
      const otherUser = await registerUser('expense-del-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${author.body.token}` },
        body: JSON.stringify({ name: uniqueValue('expenses-del-group-auth') }),
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
        body: JSON.stringify({ description: 'Tickets', amount: 100 }),
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
});
