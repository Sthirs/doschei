/**
 * Path ids that are not UUIDs can never name a row. Before the route-level
 * guard they reached Postgres and came back as a 500 HTML page carrying a
 * stack trace (GET /api/groups/:id) or as a 400 echoing the raw
 * `invalid input syntax for type uuid` error. Every group route must answer
 * them as a clean 404 JSON — and still demand authentication first.
 */
import { createJsonRequest, ensureBackendAvailable } from './helpers/api';
import { bearer, createSoloGroup } from './helpers/groups';

const BAD_ID = 'not-a-uuid';

describe('malformed path ids on /api/groups routes', () => {
  let token: string;
  let groupId: string;

  beforeAll(async () => {
    await ensureBackendAvailable();
    const group = await createSoloGroup('malformed-ids');
    token = group.owner.token;
    groupId = group.groupId;
  });

  const cases = (): Array<[string, string, string]> => [
    ['GET', `/api/groups/${BAD_ID}`, 'Group not found.'],
    ['PATCH', `/api/groups/${BAD_ID}`, 'Group not found.'],
    ['POST', `/api/groups/${BAD_ID}/members`, 'Group not found.'],
    ['POST', `/api/groups/${BAD_ID}/expenses`, 'Group not found.'],
    ['GET', `/api/groups/${BAD_ID}/expenses/export?month=2026-01`, 'Group not found.'],
    ['POST', `/api/groups/${BAD_ID}/settlements`, 'Group not found.'],
    ['PATCH', `/api/groups/${groupId}/expenses/${BAD_ID}`, 'Expense not found.'],
    ['DELETE', `/api/groups/${groupId}/expenses/${BAD_ID}`, 'Expense not found.'],
    ['PATCH', `/api/groups/${groupId}/settlements/${BAD_ID}`, 'Settlement not found.'],
    ['DELETE', `/api/groups/${groupId}/settlements/${BAD_ID}`, 'Settlement not found.'],
    ['POST', `/api/groups/${groupId}/invitations/${BAD_ID}/accept`, 'Invitation not found.'],
    ['POST', `/api/groups/${groupId}/invitations/${BAD_ID}/decline`, 'Invitation not found.'],
    ['DELETE', `/api/groups/${groupId}/invitations/${BAD_ID}`, 'Invitation not found.'],
    ['DELETE', `/api/groups/${groupId}/members/${BAD_ID}`, 'User is not a member of this group.'],
  ];

  it('answers every route with 404 JSON and never leaks a database error', async () => {
    for (const [method, path, message] of cases()) {
      const response = await createJsonRequest<{ message: string }>(path, {
        method,
        headers: bearer(token),
        body: method === 'GET' ? undefined : JSON.stringify({ name: 'x', email: 'x@example.com', amount: 1 }),
      });

      expect({ method, path, status: response.status, body: response.body }).toEqual({
        method,
        path,
        status: 404,
        body: { message },
      });
    }
  });

  it('still answers 401 first for an unauthenticated caller', async () => {
    const response = await createJsonRequest(`/api/groups/${BAD_ID}`);

    expect(response.status).toBe(401);
  });
});
