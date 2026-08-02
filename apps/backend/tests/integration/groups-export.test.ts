import { createJsonRequest, createRawRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const currentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const createExpense = (token: string, groupId: string, body: Record<string, unknown>) =>
  createJsonRequest(`/api/groups/${groupId}/expenses`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  });

const createSettlement = (token: string, groupId: string, body: Record<string, unknown>) =>
  createJsonRequest(`/api/groups/${groupId}/settlements`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  });

describe('GET /api/groups/:id/expenses/export', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('200 returns streamed CSV for the selected month with per-member net columns and a settlement row', async () => {
    const demo = await registerUser('groups-export');
    const alice = await registerUser('groups-export-alice');

    const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ name: uniqueValue('groups-export-group') }),
    });
    const groupId = groupRes.body.group.id;

    const addMemberRes = await createJsonRequest(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ email: alice.body.user.email }),
    });
    expect(addMemberRes.status).toBe(200);

    const month = currentMonth();
    const today = todayIso();

    // 1) In-month expense: alice paid 100, split 50/50 → alice +50.00, demo -50.00
    const expenseRes = await createExpense(demo.body.token, groupId, {
      description: 'Pizza dinner',
      amount: 100.0,
      category: 'dining-out',
      date: today,
      paidByUserId: alice.body.user.id,
      splits: [
        { userId: demo.body.user.id, shareType: 'EQUAL', shareValue: 50 },
        { userId: alice.body.user.id, shareType: 'EQUAL', shareValue: 50 },
      ],
    });
    expect(expenseRes.status).toBe(201);

    // 2) Settlement: demo → alice 30 → demo +30.00, alice -30.00
    const settleRes = await createSettlement(demo.body.token, groupId, {
      paidByUserId: demo.body.user.id,
      paidToUserId: alice.body.user.id,
      amount: 30.0,
      date: today,
    });
    expect(settleRes.status).toBe(201);

    // 3) Out-of-month expense — must be excluded by the month filter
    const outRes = await createExpense(demo.body.token, groupId, {
      description: 'Ancient groceries',
      amount: 999.99,
      category: 'groceries',
      date: '2020-01-15',
      paidByUserId: demo.body.user.id,
      splits: [
        { userId: demo.body.user.id, shareType: 'EQUAL', shareValue: 0 },
        { userId: alice.body.user.id, shareType: 'EQUAL', shareValue: 0 },
      ],
    });
    expect(outRes.status).toBe(201);

    const response = await createRawRequest(`/api/groups/${groupId}/expenses/export?month=${month}`, {
      headers: bearer(demo.body.token),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/csv/);
    const disposition = response.headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/attachment/);
    expect(disposition).toMatch(/filename=/);
    expect(disposition).toMatch(/filename\*=UTF-8''/);

    const lines = response.text.split('\r\n').filter(Boolean);
    // header + 2 in-month rows (expense + settlement); out-of-month excluded
    expect(lines).toHaveLength(3);

    // Header: date, description, category, expense, currency, then members sorted by displayName ASC
    const headerFields = lines[0]!.split(',');
    const sortedNames = [demo.body.user.displayName, alice.body.user.displayName].sort();
    expect(headerFields).toEqual([
      'date',
      'description',
      'category',
      'expense',
      'currency',
      ...sortedNames,
    ]);

    const memberIndex = new Map<string, number>();
    sortedNames.forEach((name, i) => memberIndex.set(name, i + 5));
    const demoIdx = memberIndex.get(demo.body.user.displayName)!;
    const aliceIdx = memberIndex.get(alice.body.user.displayName)!;

    // Row order is date ASC, createdAt ASC — expense was created before settlement
    const expenseFields = lines[1]!.split(',');
    expect(expenseFields[0]).toBe(today);
    expect(expenseFields[1]).toBe('Pizza dinner');
    expect(expenseFields[2]).toBe('dining-out');
    expect(expenseFields[3]).toBe('100.00');
    expect(expenseFields[4]).toBe('EUR');
    expect(expenseFields[aliceIdx]).toBe('50.00');
    expect(expenseFields[demoIdx]).toBe('-50.00');

    const settlementFields = lines[2]!.split(',');
    expect(settlementFields[0]).toBe(today);
    expect(settlementFields[1]).toBe('Settlement');
    expect(settlementFields[2]).toBe('general');
    expect(settlementFields[3]).toBe('30.00');
    expect(settlementFields[4]).toBe('EUR');
    expect(settlementFields[aliceIdx]).toBe('-30.00');
    expect(settlementFields[demoIdx]).toBe('30.00');

    // The out-of-month row must not appear anywhere in the body
    expect(response.text).not.toContain('Ancient groceries');
  });

  it('400 when month is missing', async () => {
    const demo = await registerUser('groups-export-missing-month');
    const alice = await registerUser('groups-export-missing-month-alice');

    const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ name: uniqueValue('groups-export-missing-group') }),
    });
    const groupId = groupRes.body.group.id;
    const addMemberRes = await createJsonRequest(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ email: alice.body.user.email }),
    });
    expect(addMemberRes.status).toBe(200);

    const response = await createJsonRequest<{ message: string }>(`/api/groups/${groupId}/expenses/export`, {
      headers: bearer(demo.body.token),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/month.*required/i);
  });

  it.each(['2026-13', '2026-1', '2026-00', 'abc', '202603'])('400 on malformed month %s', async (badMonth) => {
    const demo = await registerUser('groups-export-bad-month');
    const alice = await registerUser('groups-export-bad-month-alice');

    const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ name: uniqueValue('groups-export-bad-month-group') }),
    });
    const groupId = groupRes.body.group.id;
    const addMemberRes = await createJsonRequest(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ email: alice.body.user.email }),
    });
    expect(addMemberRes.status).toBe(200);

    const response = await createJsonRequest<{ message: string }>(
      `/api/groups/${groupId}/expenses/export?month=${badMonth}`,
      { headers: bearer(demo.body.token) },
    );

    expect(response.status).toBe(400);
  });

  it('401 without bearer token', async () => {
    const demo = await registerUser('groups-export-no-auth');
    const alice = await registerUser('groups-export-no-auth-alice');

    const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ name: uniqueValue('groups-export-no-auth-group') }),
    });
    const groupId = groupRes.body.group.id;
    const addMemberRes = await createJsonRequest(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: bearer(demo.body.token),
      body: JSON.stringify({ email: alice.body.user.email }),
    });
    expect(addMemberRes.status).toBe(200);

    const response = await createJsonRequest<{ message: string }>(
      `/api/groups/${groupId}/expenses/export?month=${currentMonth()}`,
    );

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });

  it('404 for non-member', async () => {
    const owner = await registerUser('groups-export-non-member-owner');
    const outsider = await registerUser('groups-export-non-member-outsider');

    const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: bearer(owner.body.token),
      body: JSON.stringify({ name: uniqueValue('groups-export-non-member-group') }),
    });
    const groupId = groupRes.body.group.id;

    const response = await createJsonRequest<{ message: string }>(
      `/api/groups/${groupId}/expenses/export?month=${currentMonth()}`,
      { headers: bearer(outsider.body.token) },
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/group not found/i);
  });

  it('404 for non-existent group', async () => {
    const demo = await registerUser('groups-export-404');
    const response = await createJsonRequest<{ message: string }>(
      `/api/groups/00000000-0000-0000-0000-000000000000/expenses/export?month=${currentMonth()}`,
      { headers: bearer(demo.body.token) },
    );

    expect(response.status).toBe(404);
  });
});
