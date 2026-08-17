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
      groups: Array<{ id: string; name: string; imageUrl: string | null; memberCount: number; netForCurrentUser: number; members: Array<{ email: string }> }>;
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
      netForCurrentUser: 0,
    });
    expect(response.body.groups[0].members[0].email).toBe(registerResponse.body.user.email);
  });

  it('returns non-zero netForCurrentUser for a group with expenses', async () => {
    const payer = await registerUser('groups-list-net-payer');
    const participant = await registerUser('groups-list-net-participant');

    const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${payer.body.token}` },
      body: JSON.stringify({ name: uniqueValue('net-group') }),
    });
    const groupId = groupRes.body.group.id;

    const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${payer.body.token}` },
      body: JSON.stringify({ email: participant.body.user.email }),
    });
    await createJsonRequest(`/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${participant.body.token}` },
    });

    await createJsonRequest(`/api/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${payer.body.token}` },
      body: JSON.stringify({
        description: 'Dinner',
        amount: 100,
        paidByUserId: payer.body.user.id,
        splits: [
          { userId: payer.body.user.id, shareType: 'PERCENT', shareValue: 50 },
          { userId: participant.body.user.id, shareType: 'PERCENT', shareValue: 50 },
        ],
      }),
    });

    const response = await createJsonRequest<{
      groups: Array<{ id: string; netForCurrentUser: number }>;
    }>('/api/groups', {
      headers: { Authorization: `Bearer ${payer.body.token}` },
    });

    expect(response.status).toBe(200);
    const targetGroup = response.body.groups.find((group) => group.id === groupId);
    expect(targetGroup).toBeDefined();
    expect(targetGroup!.netForCurrentUser).toBe(50);
  });

  it('rejects unauthenticated access', async () => {
    const response = await createJsonRequest<{ message: string }>('/api/groups');

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });
});
