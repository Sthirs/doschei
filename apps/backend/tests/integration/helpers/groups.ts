import { createJsonRequest, registerUser, uniqueValue } from './api';

export type TestUser = {
  token: string;
  user: { id: string; email: string; displayName: string };
};

export type BalanceEntry = { userId: string; displayName: string; netForCurrentUser: number };

export type GroupDetail = {
  id: string;
  name: string;
  members: Array<{ id: string; email: string; displayName: string }>;
  expenses: Array<{ id: string; description: string; amount: number; kind: 'EXPENSE' | 'SETTLEMENT' }>;
  balance: { currentUserId: string; netForCurrentUser: number; perUser: BalanceEntry[] };
  pendingInvitations: Array<{ id: string; email: string }>;
};

export type Split = { userId: string; shareType: 'EQUAL' | 'PERCENT' | 'FIXED'; shareValue: number };

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A never-issued id: well-formed UUID, so it reaches the lookup rather than the shape check. */
export const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

export const newUser = async (prefix: string): Promise<TestUser> => {
  const response = await registerUser(prefix);
  if (response.status !== 201) {
    throw new Error(`register ${prefix} failed with ${response.status}`);
  }
  return response.body;
};

/**
 * Registers an owner plus `extraMembers` users, creates a group as the owner
 * and has every extra user accept an invitation. `members[0]` is the owner.
 */
export const createGroupWithMembers = async (
  prefix: string,
  extraMembers = 1,
): Promise<{ groupId: string; members: TestUser[] }> => {
  const owner = await newUser(prefix);
  const groupRes = await createJsonRequest<{ group: { id: string } }>('/api/groups', {
    method: 'POST',
    headers: bearer(owner.token),
    body: JSON.stringify({ name: uniqueValue(`${prefix}-group`) }),
  });
  const groupId = groupRes.body.group.id;
  const members = [owner];

  for (let index = 0; index < extraMembers; index += 1) {
    const member = await newUser(`${prefix}-m${index + 1}`);
    const inviteRes = await createJsonRequest<{ invitation: { id: string } }>(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: bearer(owner.token),
      body: JSON.stringify({ email: member.user.email }),
    });
    const acceptRes = await createJsonRequest(
      `/api/groups/${groupId}/invitations/${inviteRes.body.invitation.id}/accept`,
      { method: 'POST', headers: bearer(member.token) },
    );
    if (acceptRes.status !== 200) {
      throw new Error(`accept for ${prefix} member ${index + 1} failed with ${acceptRes.status}`);
    }
    members.push(member);
  }

  return { groupId, members };
};

/** Creates a standalone group owned by a fresh user. */
export const createSoloGroup = async (prefix: string) => {
  const { groupId, members } = await createGroupWithMembers(prefix, 0);
  return { groupId, owner: members[0] };
};

export const equalSplits = (users: TestUser[]): Split[] =>
  users.map((member) => ({ userId: member.user.id, shareType: 'EQUAL', shareValue: 0 }));

export const postExpense = (
  token: string,
  groupId: string,
  body: { description?: string; amount: unknown; splits: Split[]; paidByUserId?: string },
) =>
  createJsonRequest<{ expense: { id: string; amount: number }; message?: string }>(`/api/groups/${groupId}/expenses`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ description: 'Test expense', ...body }),
  });

export const postSettlement = (
  token: string,
  groupId: string,
  body: { paidToUserId: string; amount: unknown; paidByUserId?: string },
) =>
  createJsonRequest<{ expense: { id: string; amount: number }; message?: string }>(`/api/groups/${groupId}/settlements`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  });

export const fetchGroup = async (token: string, groupId: string): Promise<GroupDetail> => {
  const response = await createJsonRequest<{ group: GroupDetail }>(`/api/groups/${groupId}`, {
    headers: bearer(token),
  });
  if (response.status !== 200) {
    throw new Error(`GET group ${groupId} failed with ${response.status}`);
  }
  return response.body.group;
};

export const toCents = (value: number) => Math.round(value * 100);
