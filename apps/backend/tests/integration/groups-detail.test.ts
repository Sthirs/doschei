import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

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
});
