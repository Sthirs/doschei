import { createJsonRequest, createMultipartRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

describe('POST /api/groups/:id/image', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  const smallPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const smallPngBuffer = Buffer.from(smallPngBase64, 'base64');

  const createPngBlob = () => new Blob([smallPngBuffer], { type: 'image/png' });

  it('uploads a small PNG as a group member and returns 200 with imageUrl as data:image/webp;base64', async () => {
    const registerResponse = await registerUser('groups-image-member');

    const groupName = uniqueValue('group-with-image');
    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const formData = new FormData();
    formData.append('image', createPngBlob(), 'group.png');

    const response = await createMultipartRequest<{
      group: { id: string; name: string; imageUrl: string | null; memberCount: number; members: Array<{ id: string; email: string; displayName: string }>; netForCurrentUser: number };
    }>(`/api/groups/${groupId}/image`, formData, registerResponse.body.token);

    expect(response.status).toBe(200);
    expect(response.body.group.imageUrl).toBeDefined();
    expect(response.body.group.imageUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it('persists the imageUrl — GET /api/groups/:id returns the same imageUrl', async () => {
    const registerResponse = await registerUser('groups-image-persist');

    const groupName = uniqueValue('group-persist-image');
    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const formData = new FormData();
    formData.append('image', createPngBlob(), 'group.png');

    const uploadResponse = await createMultipartRequest<{
      group: { id: string; name: string; imageUrl: string | null; memberCount: number; members: Array<{ id: string; email: string; displayName: string }>; netForCurrentUser: number };
    }>(`/api/groups/${groupId}/image`, formData, registerResponse.body.token);

    expect(uploadResponse.status).toBe(200);

    const getResponse = await createJsonRequest<{
      group: { id: string; name: string; imageUrl: string | null; memberCount: number; members: Array<{ id: string; email: string; displayName: string }>; netForCurrentUser: number };
    }>(`/api/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
    });

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.group.imageUrl).toBe(uploadResponse.body.group.imageUrl);
  });

  it('rejects non-member users with 403', async () => {
    const user1Response = await registerUser('groups-image-owner');
    const user2Response = await registerUser('groups-image-nonmember');
    const groupName = uniqueValue('exclusive-group-image');

    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Response.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const formData = new FormData();
    formData.append('image', createPngBlob(), 'group.png');

    const response = await createMultipartRequest<{ message: string }>(
      `/api/groups/${groupId}/image`,
      formData,
      user2Response.body.token,
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/group not found or you are not a member/i);
  });

  it('returns 404 for unknown group id', async () => {
    const registerResponse = await registerUser('groups-image-notfound');
    const fakeGroupId = '00000000-0000-0000-0000-000000000000';

    const formData = new FormData();
    formData.append('image', createPngBlob(), 'group.png');

    const response = await createMultipartRequest<{ message: string }>(
      `/api/groups/${fakeGroupId}/image`,
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/group not found or you are not a member/i);
  });

  it('rejects unsupported MIME type (text/plain) with 415', async () => {
    const registerResponse = await registerUser('groups-image-mime');

    const groupName = uniqueValue('group-mime-test');
    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const textBlob = new Blob(['not an image'], { type: 'text/plain' });

    const formData = new FormData();
    formData.append('image', textBlob, 'file.txt');

    const response = await createMultipartRequest<{ message: string }>(
      `/api/groups/${groupId}/image`,
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(415);
  });

  it('rejects missing file with 400', async () => {
    const registerResponse = await registerUser('groups-image-missing');

    const groupName = uniqueValue('group-missing-file');
    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const formData = new FormData();
    // No file appended

    const response = await createMultipartRequest<{ message: string }>(
      `/api/groups/${groupId}/image`,
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/image file is required/i);
  });

  it('rejects invalid/corrupt image data with 422', async () => {
    const registerResponse = await registerUser('groups-image-corrupt');

    const groupName = uniqueValue('group-corrupt-image');
    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);
    const groupId = createGroupResponse.body.group.id;

    const corruptBlob = new Blob(['not a valid image'], { type: 'image/png' });

    const formData = new FormData();
    formData.append('image', corruptBlob, 'corrupt.png');

    const response = await createMultipartRequest<{ message: string }>(
      `/api/groups/${groupId}/image`,
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(422);
  });

  it('exposes member imageUrl in GET /api/groups after user uploads avatar via POST /api/auth/me/image', async () => {
    const registerResponse = await registerUser('groups-member-avatar');

    const avatarFormData = new FormData();
    avatarFormData.append('image', createPngBlob(), 'avatar.png');

    const avatarResponse = await createMultipartRequest<{
      user: { id: string; email: string; displayName: string; imageUrl: string | null };
    }>('/api/auth/me/image', avatarFormData, registerResponse.body.token);

    expect(avatarResponse.status).toBe(200);
    expect(avatarResponse.body.user.imageUrl).toMatch(/^data:image\/webp;base64,/);
    const uploadedImageUrl = avatarResponse.body.user.imageUrl;

    const groupName = uniqueValue('group-member-avatar');
    const createGroupResponse = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
      body: JSON.stringify({ name: groupName }),
    });

    expect(createGroupResponse.status).toBe(201);

    const groupsResponse = await createJsonRequest<{
      groups: Array<{
        id: string;
        name: string;
        imageUrl: string | null;
        memberCount: number;
        members: Array<{ id: string; email: string; displayName: string; imageUrl: string | null }>;
        netForCurrentUser: number;
      }>;
      invitations: unknown[];
    }>('/api/groups', {
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
    });

    expect(groupsResponse.status).toBe(200);
    expect(groupsResponse.body.groups.length).toBeGreaterThan(0);

    const group = groupsResponse.body.groups.find((g) => g.name === groupName);
    expect(group).toBeDefined();
    expect(group!.members.length).toBe(1);

    const member = group!.members[0];
    expect(member.imageUrl).toBe(uploadedImageUrl);
    expect(member.imageUrl).toMatch(/^data:image\/webp;base64,/);
  });
});
