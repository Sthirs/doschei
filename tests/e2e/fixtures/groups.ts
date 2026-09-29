/*
 * API-only group setup for specs whose subject is NOT group creation or
 * invitation: they build their group over the API so the UI steps under test
 * stay short, and so they never touch the shared demo user's groups list.
 *
 * Members get distinct FIRST names on purpose: the expense form's payer and
 * split chips render only the first word of a display name (PaidBySection.vue,
 * SplitWithSection.vue), and GroupDetailPage matches chips on that word.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { registerViaApi, uniqueValue, type RegisteredUser } from './auth';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

async function api<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseURL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${await response.text()}`);
  }
  return (response.status === 204 ? {} : await response.json()) as T;
}

/** Registers a fresh user whose display name starts with `firstName`. */
export async function registerNamedUser(firstName: string): Promise<RegisteredUser> {
  const suffix = uniqueValue(firstName.toLowerCase());
  return registerViaApi(`${suffix}@doschei.local`, 'password123', `${firstName} ${suffix.slice(-6)}`);
}

/** Owner creates a group; every other user is invited and accepts over the API. */
export async function createGroupViaApi(
  owner: RegisteredUser,
  members: RegisteredUser[],
  namePrefix = 'e2e-group',
): Promise<{ id: string; name: string }> {
  const name = uniqueValue(namePrefix);
  const { group } = await api<{ group: { id: string } }>(owner.token, 'POST', '/groups', { name });

  for (const member of members) {
    const { invitation } = await api<{ invitation: { id: string } }>(
      owner.token,
      'POST',
      `/groups/${group.id}/members`,
      { email: member.email },
    );
    await api(member.token, 'POST', `/groups/${group.id}/invitations/${invitation.id}/accept`);
  }

  return { id: group.id, name };
}

/** Invites an email without accepting, leaving a pending invitation. */
export async function inviteViaApi(owner: RegisteredUser, groupId: string, email: string): Promise<void> {
  await api(owner.token, 'POST', `/groups/${groupId}/members`, { email });
}

/** Uploads tests/e2e/fixtures/test-image.png as the user's profile picture. */
export async function uploadAvatarViaApi(user: RegisteredUser): Promise<string> {
  const formData = new FormData();
  const png = readFileSync(resolve('tests/e2e/fixtures/test-image.png'));
  formData.append('image', new Blob([png], { type: 'image/png' }), 'avatar.png');
  const response = await fetch(`${baseURL}/api/auth/me/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}` },
    body: formData,
  });
  if (response.status !== 200) {
    throw new Error(`avatar upload failed with ${response.status}`);
  }
  const { user: updated } = (await response.json()) as { user: { imageUrl: string } };
  return updated.imageUrl;
}

export type BalanceView = {
  netForCurrentUser: number;
  perUser: Array<{ userId: string; netForCurrentUser: number }>;
};

export async function fetchBalanceViaApi(user: RegisteredUser, groupId: string): Promise<BalanceView> {
  const { group } = await api<{ group: { balance: BalanceView } }>(user.token, 'GET', `/groups/${groupId}`);
  return group.balance;
}

export async function fetchExpensesViaApi(
  user: RegisteredUser,
  groupId: string,
): Promise<Array<{ description: string; amount: number; splits: Array<{ userId: string; shareType: string; shareValue: number; computedAmount: number }> }>> {
  const { group } = await api<{ group: { expenses: never[] } }>(user.token, 'GET', `/groups/${groupId}`);
  return group.expenses;
}
