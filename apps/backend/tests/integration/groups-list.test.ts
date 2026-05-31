import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

describe('GET /api/groups', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('returns the authenticated user groups', async () => {
    const registerResponse = await registerUser('groups-list');
    const groupName = uniqueValue('road-trip');

    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);

    const response = await createJsonRequest<{
      groups: Array<{ id: string; name: string; imageUrl: string | null; memberCount: number; members: Array<{ email: string }> }>;
    }>('/api/groups', {
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.groups).toHaveLength(1);
    expect(response.body.groups[0]).toMatchObject({
      id: createGroupResponse.body.group.id,
      name: groupName,
      imageUrl: null,
      memberCount: 1,
    });
    expect(response.body.groups[0].members[0].email).toBe(registerResponse.body.user.email);
  });

  it('rejects unauthenticated access', async () => {
    const response = await createJsonRequest<{ message: string }>('/api/groups');

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });
});
