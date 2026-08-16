import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

describe('Group Members Endpoints', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  describe('POST /api/groups/:id/members', () => {
    it('adds a member by email', async () => {
      const owner = await registerUser('members-add-owner');
      const newMember = await registerUser('members-add-new');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-add-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{
        invitation: { id: string; groupId: string; inviteeEmail: string; status: string; createdAt: string };
      }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: newMember.body.user.email }),
      });

      expect(response.status).toBe(201);
      expect(response.body.invitation).toEqual(
        expect.objectContaining({
          groupId,
          inviteeEmail: newMember.body.user.email,
          status: 'pending',
        }),
      );
      expect(response.body.invitation).not.toHaveProperty('displayName');
      expect(response.body.invitation).not.toHaveProperty('group');

      const groupDetail = await createJsonRequest<{
        group: {
          memberCount: number;
          members: Array<{ id: string; email: string }>;
          pendingInvitations: Array<{ id: string; email: string; createdAt: string }>;
        };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${owner.body.token}` },
      });

      expect(groupDetail.body.group.memberCount).toBe(1);
      expect(groupDetail.body.group.members).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ email: newMember.body.user.email })]),
      );
      expect(groupDetail.body.group.pendingInvitations).toHaveLength(1);
      expect(groupDetail.body.group.pendingInvitations[0]).toEqual(
        expect.objectContaining({ email: newMember.body.user.email }),
      );
      expect(groupDetail.body.group.pendingInvitations[0]).not.toHaveProperty('displayName');
      expect(groupDetail.body.group.pendingInvitations[0]).not.toHaveProperty('inviteeId');
      expect(groupDetail.body.group.pendingInvitations[0]).not.toHaveProperty('userId');
    });

    it('returns 201 for any email (no inviteeId in response)', async () => {
      const owner = await registerUser('members-add-nouser');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-nouser-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{
        invitation: { id: string; groupId: string; inviteeEmail: string; status: string; createdAt: string };
      }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      });

      expect(response.status).toBe(201);
      expect(response.body.invitation.inviteeEmail).toBe('nonexistent@example.com');
      expect(response.body.invitation).not.toHaveProperty('inviteeId');
      expect(response.body.invitation.status).toBe('pending');
    });

    it('returns 400 for already existing member', async () => {
      const owner = await registerUser('members-add-dup');
      const member = await registerUser('members-add-dup-target');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-dup-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: member.body.user.email }),
        },
      );

      await createJsonRequest(
        `/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${member.body.token}` },
        },
      );

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: member.body.user.email }),
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/already a member/i);
    });

    it('returns 400 for missing email', async () => {
      const owner = await registerUser('members-add-noemail');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-noemail-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/email is required/i);
    });

    it('rejects unauthenticated access', async () => {
      const response = await createJsonRequest<{ message: string }>('/api/groups/123/members', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      expect(response.status).toBe(401);
    });

    it('rejects non-member adding someone', async () => {
      const owner = await registerUser('members-add-reject-owner');
      const outsider = await registerUser('members-add-reject-outsider');
      const target = await registerUser('members-add-reject-target');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-reject-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${outsider.body.token}` },
          body: JSON.stringify({ email: target.body.user.email }),
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found|not a member/i);
    });
  });

  describe('DELETE /api/groups/:id/members/:userId', () => {
    it('removes a member from the group', async () => {
      const owner = await registerUser('members-del-owner');
      const member = await registerUser('members-del-target');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-del-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: member.body.user.email }),
        },
      );

      await createJsonRequest(
        `/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${member.body.token}` },
        },
      );

      const response = await createJsonRequest(
        `/api/groups/${groupId}/members/${member.body.user.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(response.status).toBe(204);

      const groupDetail = await createJsonRequest<{ group: { memberCount: number; members: Array<{ id: string }> } }>(
        `/api/groups/${groupId}`,
        {
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(groupDetail.body.group.memberCount).toBe(1);
      expect(groupDetail.body.group.members).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: member.body.user.id })]),
      );
    });

    it('returns 404 for user not in group', async () => {
      const owner = await registerUser('members-del-notmember-owner');
      const outsider = await registerUser('members-del-notmember-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('members-del-notmember-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/members/${outsider.body.user.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not a member/i);
    });

    it('rejects unauthenticated access', async () => {
      const response = await createJsonRequest<{ message: string }>('/api/groups/123/members/456', {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/groups/:id', () => {
    it('updates the group name', async () => {
      const owner = await registerUser('groups-patch-owner');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('groups-patch-orig') }),
      });
      const groupId = groupRes.body.group.id;
      const newName = uniqueValue('groups-patch-updated');

      const response = await createJsonRequest<{ group: { id: string; name: string } }>(
        `/api/groups/${groupId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ name: newName }),
        },
      );

      expect(response.status).toBe(200);
      expect(response.body.group.name).toBe(newName);
    });

    it('returns 400 for empty name', async () => {
      const owner = await registerUser('groups-patch-empty');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('groups-patch-empty-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ name: '' }),
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/group name is required/i);
    });

    it('rejects non-member updating', async () => {
      const owner = await registerUser('groups-patch-reject-owner');
      const outsider = await registerUser('groups-patch-reject-outsider');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('groups-patch-reject-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${outsider.body.token}` },
          body: JSON.stringify({ name: 'hacked' }),
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found|not a member/i);
    });

    it('rejects unauthenticated access', async () => {
      const response = await createJsonRequest<{ message: string }>('/api/groups/123', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'hacked' }),
      });

      expect(response.status).toBe(401);
    });
  });
});
