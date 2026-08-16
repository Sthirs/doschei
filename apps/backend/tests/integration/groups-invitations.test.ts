import { createJsonRequest, ensureBackendAvailable, registerUser, uniqueValue } from './helpers/api';

const FAKE_INVITATION_ID = '00000000-0000-0000-0000-000000000000';

describe('Group Invitations', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  describe('POST /api/groups/:id/members (invitation creation)', () => {
    it('creates a pending invitation for a registered user (201, inviteeId set)', async () => {
      const owner = await registerUser('inv-create-owner');
      const invitee = await registerUser('inv-create-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-create-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{
        invitation: { id: string; groupId: string; inviteeEmail: string; inviteeId: string; status: string; createdAt: string };
      }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: invitee.body.user.email }),
      });

      expect(response.status).toBe(201);
      expect(response.body.invitation.groupId).toBe(groupId);
      expect(response.body.invitation.inviteeEmail).toBe(invitee.body.user.email);
      expect(response.body.invitation.inviteeId).toBe(invitee.body.user.id);
      expect(response.body.invitation.status).toBe('pending');
      expect(response.body.invitation).not.toHaveProperty('displayName');
    });

    it('creates a pending invitation for an unknown email (201, inviteeId null)', async () => {
      const owner = await registerUser('inv-unknown-owner');
      const unknownEmail = `${uniqueValue('inv-unknown')}-unknown@example.com`;

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-unknown-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{
        invitation: { id: string; groupId: string; inviteeEmail: string; inviteeId: string | null; status: string; createdAt: string };
      }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: unknownEmail }),
      });

      expect(response.status).toBe(201);
      expect(response.body.invitation.inviteeEmail).toBe(unknownEmail);
      expect(response.body.invitation.inviteeId).toBeNull();
      expect(response.body.invitation.status).toBe('pending');
    });

    it('returns 400 for missing email', async () => {
      const owner = await registerUser('inv-missing-owner');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-missing-group') }),
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

    it('returns 404 for nonexistent group', async () => {
      const owner = await registerUser('inv-nogroup-owner');

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${FAKE_INVITATION_ID}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: 'someone@example.com' }),
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found|not a member/i);
    });

    it('returns 404 when caller is not a member', async () => {
      const owner = await registerUser('inv-nonmember-owner');
      const outsider = await registerUser('inv-nonmember-outsider');
      const target = await registerUser('inv-nonmember-target');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-nonmember-group') }),
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

  describe('email format validation', () => {
    const malformedEmailCases: Array<{ description: string; email: string }> = [
      { description: 'missing local part and domain', email: 'foo' },
      { description: 'missing domain', email: 'foo@' },
      { description: 'missing TLD dot', email: 'foo@bar' },
      { description: 'multiple @ characters', email: 'a@b@c' },
      { description: 'embedded space is invalid format', email: 'foo bar@x.com' },
      { description: 'over 254 char length cap', email: `${'x'.repeat(256)}@x.com` },
    ];

    for (const { description, email } of malformedEmailCases) {
      it(`returns 400 for malformed email (${description})`, async () => {
        const owner = await registerUser(`inv-fmt-${description.replace(/\s+/g, '-')}-owner`);

        const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ name: uniqueValue(`inv-fmt-${description.replace(/\s+/g, '-')}-group`) }),
        });
        const groupId = groupRes.body.group.id;

        const response = await createJsonRequest<{ message: string }>(
          `/api/groups/${groupId}/members`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${owner.body.token}` },
            body: JSON.stringify({ email }),
          },
        );

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/email is required/i);
      });
    }

    it('returns 201 for whitespace-padded valid email (proves trim() runs before regex)', async () => {
      const owner = await registerUser('inv-fmt-trim-owner');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-fmt-trim-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{
        invitation: { inviteeEmail: string; inviteeId: string | null; status: string };
      }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: '  x@y.com  ' }),
      });

      expect(response.status).toBe(201);
      expect(response.body.invitation.inviteeEmail).toBe('x@y.com');
      expect(response.body.invitation.inviteeId).toBeNull();
      expect(response.body.invitation.status).toBe('pending');
    });
  });

  describe('Deferred attach on register', () => {
    it('attaches pending invitations when a matching user registers', async () => {
      const owner = await registerUser('inv-deferred-owner');
      const deferredEmail = `${uniqueValue('inv-deferred')}-deferred@example.com`;

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-deferred-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{
        invitation: { inviteeId: string | null };
      }>(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: deferredEmail }),
      });

      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.invitation.inviteeId).toBeNull();

      const newUserRes = await createJsonRequest<{ token: string; user: { id: string; email: string } }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            email: deferredEmail,
            password: 'password123',
            displayName: uniqueValue('Deferred User'),
          }),
        },
      );

      expect(newUserRes.status).toBe(201);

      const groupsRes = await createJsonRequest<{
        invitations: Array<{ id: string; groupId: string; groupName: string; inviterName: string; createdAt: string }>;
      }>('/api/groups', {
        headers: { Authorization: `Bearer ${newUserRes.body.token}` },
      });

      expect(groupsRes.status).toBe(200);
      const matchingInvitation = groupsRes.body.invitations.find((inv) => inv.groupId === groupId);
      expect(matchingInvitation).toBeDefined();
    });
  });

  describe('POST /api/groups/:id/invitations/:invitationId/accept', () => {
    it('accepts an invitation (200, invitee becomes member)', async () => {
      const owner = await registerUser('inv-accept-owner');
      const invitee = await registerUser('inv-accept-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-accept-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      const response = await createJsonRequest<{
        invitation: { id: string; status: string; inviteeId: string };
      }>(`/api/groups/${groupId}/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${invitee.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.invitation.status).toBe('accepted');

      const groupDetail = await createJsonRequest<{
        group: { members: Array<{ id: string; displayName: string }> };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${owner.body.token}` },
      });

      expect(groupDetail.body.group.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: invitee.body.user.id, displayName: invitee.body.user.displayName }),
        ]),
      );
    });

    it('returns 404 for non-existent invitation', async () => {
      const owner = await registerUser('inv-accept-notfound-owner');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-accept-notfound-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/invitations/${FAKE_INVITATION_ID}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when caller is not the invitee', async () => {
      const owner = await registerUser('inv-accept-notinvitee-owner');
      const invitee = await registerUser('inv-accept-notinvitee-invitee');
      const other = await registerUser('inv-accept-notinvitee-other');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-accept-notinvitee-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/invitations/${invitationId}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${other.body.token}` },
        },
      );

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/not the invitee/i);
    });

    it('returns 400 when invitation is no longer pending', async () => {
      const owner = await registerUser('inv-accept-notpending-owner');
      const invitee = await registerUser('inv-accept-notpending-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-accept-notpending-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      await createJsonRequest(
        `/api/groups/${groupId}/invitations/${invitationId}/decline`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${invitee.body.token}` },
        },
      );

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/invitations/${invitationId}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${invitee.body.token}` },
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/no longer pending/i);
    });

    it('rejects unauthenticated access', async () => {
      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${FAKE_INVITATION_ID}/invitations/${FAKE_INVITATION_ID}/accept`,
        {
          method: 'POST',
        },
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/groups/:id/invitations/:invitationId/decline', () => {
    it('declines an invitation (200, then not listed)', async () => {
      const owner = await registerUser('inv-decline-owner');
      const invitee = await registerUser('inv-decline-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-decline-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      const response = await createJsonRequest<{
        invitation: { id: string; status: string };
      }>(`/api/groups/${groupId}/invitations/${invitationId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${invitee.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.invitation.status).toBe('declined');

      const groupsRes = await createJsonRequest<{
        invitations: Array<{ id: string }>;
      }>('/api/groups', {
        headers: { Authorization: `Bearer ${invitee.body.token}` },
      });

      expect(groupsRes.body.invitations).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: invitationId })]),
      );

      const groupDetail = await createJsonRequest<{
        group: { pendingInvitations: Array<{ id: string }> };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${owner.body.token}` },
      });

      expect(groupDetail.body.group.pendingInvitations).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: invitationId })]),
      );
    });

    it('allows re-inviting after decline (decline-then-reinvite)', async () => {
      const owner = await registerUser('inv-reinvite-owner');
      const invitee = await registerUser('inv-reinvite-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-reinvite-group') }),
      });
      const groupId = groupRes.body.group.id;

      const firstInvite = await createJsonRequest<{ invitation: { id: string; status: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );

      expect(firstInvite.status).toBe(201);
      expect(firstInvite.body.invitation.status).toBe('pending');

      const declineRes = await createJsonRequest<{ invitation: { status: string } }>(
        `/api/groups/${groupId}/invitations/${firstInvite.body.invitation.id}/decline`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${invitee.body.token}` },
        },
      );

      expect(declineRes.status).toBe(200);
      expect(declineRes.body.invitation.status).toBe('declined');

      const secondInvite = await createJsonRequest<{ invitation: { id: string; status: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );

      expect(secondInvite.status).toBe(201);
      expect(secondInvite.body.invitation.status).toBe('pending');
      expect(secondInvite.body.invitation.id).not.toBe(firstInvite.body.invitation.id);
    });
  });

  describe('DELETE /api/groups/:id/invitations/:invitationId (cancel)', () => {
    it('cancels an invitation (204)', async () => {
      const owner = await registerUser('inv-cancel-owner');
      const invitee = await registerUser('inv-cancel-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-cancel-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      const response = await createJsonRequest(
        `/api/groups/${groupId}/invitations/${invitationId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(response.status).toBe(204);

      const groupDetail = await createJsonRequest<{
        group: { pendingInvitations: Array<{ id: string }> };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${owner.body.token}` },
      });

      expect(groupDetail.body.group.pendingInvitations).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: invitationId })]),
      );
    });

    it('returns 404 for non-existent invitation', async () => {
      const owner = await registerUser('inv-cancel-notfound-owner');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-cancel-notfound-group') }),
      });
      const groupId = groupRes.body.group.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/invitations/${FAKE_INVITATION_ID}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/i);
    });

    it('returns 403 when caller is not the inviter', async () => {
      const owner = await registerUser('inv-cancel-notinviter-owner');
      const invitee = await registerUser('inv-cancel-notinviter-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-cancel-notinviter-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/invitations/${invitationId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${invitee.body.token}` },
        },
      );

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/not the inviter/i);
    });

    it('returns 400 when invitation is no longer pending', async () => {
      const owner = await registerUser('inv-cancel-notpending-owner');
      const invitee = await registerUser('inv-cancel-notpending-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-cancel-notpending-group') }),
      });
      const groupId = groupRes.body.group.id;

      const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(
        `/api/groups/${groupId}/members`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${owner.body.token}` },
          body: JSON.stringify({ email: invitee.body.user.email }),
        },
      );
      const invitationId = inviteRes.body.invitation.id;

      await createJsonRequest(
        `/api/groups/${groupId}/invitations/${invitationId}/accept`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${invitee.body.token}` },
        },
      );

      const response = await createJsonRequest<{ message: string }>(
        `/api/groups/${groupId}/invitations/${invitationId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${owner.body.token}` },
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/no longer pending/i);
    });
  });

  describe('GET /api/groups extensions', () => {
    it('returns empty invitations array when none pending', async () => {
      const user = await registerUser('inv-list-empty');

      const response = await createJsonRequest<{
        groups: unknown[];
        invitations: unknown[];
      }>('/api/groups', {
        headers: { Authorization: `Bearer ${user.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.invitations).toEqual([]);
    });

    it('returns pending invitations for the invitee', async () => {
      const owner = await registerUser('inv-list-owner');
      const invitee = await registerUser('inv-list-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-list-group') }),
      });
      const groupId = groupRes.body.group.id;

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: invitee.body.user.email }),
      });

      const response = await createJsonRequest<{
        invitations: Array<{ id: string; groupId: string; groupName: string; inviterName: string; createdAt: string }>;
      }>('/api/groups', {
        headers: { Authorization: `Bearer ${invitee.body.token}` },
      });

      expect(response.status).toBe(200);
      const matching = response.body.invitations.find((inv) => inv.groupId === groupId);
      expect(matching).toBeDefined();
      expect(matching).toEqual(
        expect.objectContaining({
          groupId,
          groupName: expect.any(String),
          inviterName: expect.any(String),
        }),
      );
    });
  });

  describe('GET /api/groups/:id extensions', () => {
    it('returns pendingInvitations with email-only shape', async () => {
      const owner = await registerUser('inv-detail-owner');
      const invitee = await registerUser('inv-detail-invitee');

      const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ name: uniqueValue('inv-detail-group') }),
      });
      const groupId = groupRes.body.group.id;

      await createJsonRequest(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner.body.token}` },
        body: JSON.stringify({ email: invitee.body.user.email }),
      });

      const response = await createJsonRequest<{
        group: {
          members: Array<{ id: string }>;
          pendingInvitations: Array<{ id: string; email: string; createdAt: string }>;
        };
      }>(`/api/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${owner.body.token}` },
      });

      expect(response.status).toBe(200);
      expect(response.body.group.pendingInvitations).toHaveLength(1);

      const item = response.body.group.pendingInvitations[0];
      expect(item).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          email: invitee.body.user.email,
          createdAt: expect.any(String),
        }),
      );
      expect(item).not.toHaveProperty('inviteeId');
      expect(item).not.toHaveProperty('displayName');
      expect(item).not.toHaveProperty('userId');

      expect(response.body.group.members).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: invitee.body.user.id })]),
      );
    });
  });
});
