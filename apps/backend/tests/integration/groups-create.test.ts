import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

describe('POST /api/groups', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('creates a group and associates the authenticated user', async () => {
    const registerResponse = await registerUser('groups-create');
    const groupName = uniqueValue('weekend-house');

    const createResponse = await createJsonRequest<{
      group: {
        id: string;
        name: string;
        imageUrl: string | null;
        memberCount: number;
        members: Array<{ id: string; email: string; displayName: string }>;
      };
    }>('/api/groups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.group).toMatchObject({
      name: groupName,
      imageUrl: null,
      memberCount: 1,
    });
    expect(createResponse.body.group.members).toEqual([
      {
        id: registerResponse.body.user.id,
        email: registerResponse.body.user.email,
        displayName: registerResponse.body.user.displayName,
      },
    ]);
  });

  it('rejects unauthenticated group creation', async () => {
    const response = await createJsonRequest<{ message: string }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name: uniqueValue('sneaky-group') }),
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });

  it('rejects empty group name', async () => {
    const registerResponse = await registerUser('groups-empty-name');

    const response = await createJsonRequest<{ message: string }>('/api/groups', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
      body: JSON.stringify({ name: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/group name is required/i);
  });
});
