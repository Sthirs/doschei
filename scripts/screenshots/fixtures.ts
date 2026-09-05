// ---------------------------------------------------------------------------
// Dataset builder for the README screenshots.
//
// The generator deliberately does NOT use the seeded demo user. Three reasons:
//   1. There is no group-delete endpoint, so every group an e2e spec leaves
//      behind is permanent (see tests/e2e/pages/GroupDetailPage.ts). On any
//      cluster that has run the e2e suite the demo user's /groups screen is a
//      pile of `groups-ui-*` / `inv-alpha-*` cards.
//   2. The demo user's language is mutable (tests/e2e/account/language.spec.ts
//      PATCHes it), so the screenshots could silently come out in Italian.
//   3. Seed data may not exist at all: SEED_ON_STARTUP defaults to "false" in
//      helm/doschei/values.yaml.
//
// Instead every run registers a throwaway owner plus three counterparts and
// builds the three groups through the API. Display names are chosen for the
// pixels; emails are unique so runs never collide on the shared Minikube DB.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { registerViaApi, uniqueValue } from '../../tests/e2e/fixtures/auth';

/**
 * Every visible date derives from this instant, and the browser clock is
 * pinned to it, so month headers, expense dates and the settle-up date field
 * agree with each other and stay identical across re-runs.
 *
 * Bump it to refresh the dates shown in the committed screenshots.
 */
export const ANCHOR = new Date('2025-11-18T10:30:00+01:00');

const PASSWORD = 'password123';

/**
 * Group photos, pre-sized to the 512x512 the server keeps so they stay small in
 * git. The backend re-encodes them to WebP and embeds them as data URLs.
 */
const ASSET_DIR = resolve('scripts/screenshots/assets');

type Member = { id: string; email: string; displayName: string; token: string };

export type Dataset = {
  ownerToken: string;
  veniceId: string;
  palermoId: string;
  lunchId: string;
};

/**
 * `YYYY-MM-DD` on the given day, `monthsBack` whole months before ANCHOR's
 * month. The totals chart shows a three-month window ending at the current
 * month, so offsets 0..2 are the three bars it renders.
 */
function anchorDay(day: number, monthsBack = 0): string {
  const at = new Date(ANCHOR.getFullYear(), ANCHOR.getMonth() - monthsBack, 1);
  const month = String(at.getMonth() + 1).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
}

async function api<T>(
  baseURL: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(
      `POST ${path} failed (status ${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Fail before launching a browser if the deployment is not serving, with a
 * message that names the fix rather than surfacing a bare fetch error.
 */
export async function preflight(baseURL: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${baseURL}/api/health`);
  } catch (cause) {
    throw new Error(
      `Cannot reach ${baseURL}/api/health.\n` +
        'Bring the stack up first (npm run cluster:deploy, or npm run dev behind a\n' +
        'Telepresence intercept), then pass the host:\n' +
        '  npm run screenshots -- "http://$(npm run -s dev:host)"',
      { cause },
    );
  }

  if (!response.ok) {
    throw new Error(
      `${baseURL}/api/health returned ${response.status}; the backend is not serving.`,
    );
  }
}

async function register(
  baseURL: string,
  slug: string,
  displayName: string,
): Promise<Member> {
  const email = `${uniqueValue(`shot-${slug}`)}@doschei.local`;

  try {
    const user = await registerViaApi(email, PASSWORD, displayName);
    return { id: user.id, email, displayName, token: user.token };
  } catch (cause) {
    // registerViaApi throws on any non-201, so probe for the one cause that has
    // an actionable fix rather than reporting "register failed (status 403)".
    const probe = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, displayName }),
    });

    if (probe.status === 403) {
      throw new Error(
        'POST /api/auth/register returned 403: AUTH_LOCAL_REGISTRATION_ENABLED is\n' +
          '"false" on this deployment. The screenshot generator builds its own\n' +
          'throwaway dataset and therefore needs local registration.\n' +
          'Fix: set backend AUTH_LOCAL_REGISTRATION_ENABLED="true" and redeploy, or\n' +
          'point PLAYWRIGHT_BASE_URL at a devMode deployment.',
        { cause },
      );
    }

    throw cause;
  }
}

/**
 * Attach a group photo. The endpoint takes a multipart body on the field name
 * `image` (multer, see apps/backend/src/middleware/upload.ts); Content-Type is
 * left unset so fetch generates the boundary.
 */
async function uploadGroupImage(
  baseURL: string,
  groupId: string,
  token: string,
  file: string,
): Promise<void> {
  const bytes = readFileSync(resolve(ASSET_DIR, file));
  const body = new FormData();
  body.append('image', new Blob([bytes], { type: 'image/jpeg' }), file);

  const response = await fetch(`${baseURL}/api/groups/${groupId}/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Uploading ${file} to group ${groupId} failed (status ${response.status}): ` +
        (await response.text()),
    );
  }
}

/** Create a group owned by `owner`, attach `others` as accepted members, and
 *  set the group photo. */
async function createGroup(
  baseURL: string,
  name: string,
  owner: Member,
  others: Member[],
  image: string,
): Promise<string> {
  const { group } = await api<{ group: { id: string } }>(
    baseURL,
    '/api/groups',
    owner.token,
    { name },
  );

  await uploadGroupImage(baseURL, group.id, owner.token, image);

  for (const member of others) {
    // POST /:id/members creates an *invitation*, not a membership — the invitee
    // has to accept before their name shows up in the group.
    const { invitation } = await api<{ invitation: { id: string } }>(
      baseURL,
      `/api/groups/${group.id}/members`,
      owner.token,
      { email: member.email },
    );
    await api(
      baseURL,
      `/api/groups/${group.id}/invitations/${invitation.id}/accept`,
      member.token,
    );
  }

  return group.id;
}

type ExpenseSpec = {
  description: string;
  amount: number;
  category: string;
  day: number;
  /** Whole months before ANCHOR's month; defaults to ANCHOR's own month. */
  monthsBack?: number;
  paidBy: Member;
};

/**
 * All splits are EQUAL across every member, and every amount divides evenly by
 * the member count, so the balances below are exact.
 */
async function addExpenses(
  baseURL: string,
  groupId: string,
  owner: Member,
  members: Member[],
  specs: ExpenseSpec[],
): Promise<void> {
  const splits = members.map((member) => ({
    userId: member.id,
    shareType: 'EQUAL' as const,
    shareValue: 0,
  }));

  for (const spec of specs) {
    await api(baseURL, `/api/groups/${groupId}/expenses`, owner.token, {
      description: spec.description,
      amount: spec.amount,
      date: anchorDay(spec.day, spec.monthsBack ?? 0),
      category: spec.category,
      paidByUserId: spec.paidBy.id,
      splits,
    });
  }
}

/**
 * Build the three groups shown in the README, in display order — the groups
 * list is ordered by `created_at ASC`
 * (apps/backend/src/services/group/groupCrud.ts).
 *
 * Amounts mirror apps/backend/src/services/seed/seedData.ts, so the arithmetic
 * is known-good:
 *   Weekend in Venice   you paid 142 of 204  -> you are owed  40.00
 *   Holiday in Palermo  Alice/Bob paid it all -> you owe       88.00
 *   Office Lunch        you paid 24           -> you are owed  12.00
 *
 * Venice deliberately spans the three months the totals chart windows over
 * (80 / 60 / 64), so every bar has a labelled share. Its two extra expenses are
 * a matched pair — one paid by you, one by Alice, same amount — which leaves the
 * balance untouched at +40.00.
 */
export async function buildDataset(baseURL: string): Promise<Dataset> {
  const owner = await register(baseURL, 'owner', 'Marco Rossi');
  const alice = await register(baseURL, 'alice', 'Alice Rossi');
  const bob = await register(baseURL, 'bob', 'Bob Bianchi');
  const carol = await register(baseURL, 'carol', 'Carol Colombo');

  const veniceId = await createGroup(baseURL, 'Weekend in Venice', owner, [alice], 'venice.jpeg');
  await addExpenses(baseURL, veniceId, owner, [owner, alice], [
    { description: 'Train tickets', amount: 50, category: 'bus-train', day: 12, monthsBack: 2, paidBy: owner },
    { description: 'Canal dinner', amount: 30, category: 'dining-out', day: 14, monthsBack: 2, paidBy: owner },
    { description: 'Hotel night', amount: 42, category: 'hotel', day: 9, monthsBack: 1, paidBy: owner },
    { description: 'Gondola ride', amount: 18, category: 'taxi', day: 21, monthsBack: 1, paidBy: alice },
    { description: 'Morning coffee', amount: 24, category: 'dining-out', day: 6, paidBy: alice },
    { description: 'Vaporetto pass', amount: 20, category: 'bus-train', day: 11, paidBy: owner },
    { description: 'Spritz round', amount: 20, category: 'liquor', day: 14, paidBy: alice },
  ]);

  const palermoId = await createGroup(baseURL, 'Holiday in Palermo', owner, [alice, bob], 'palermo.jpeg');
  await addExpenses(baseURL, palermoId, owner, [owner, alice, bob], [
    { description: 'Airport taxi', amount: 90, category: 'taxi', day: 3, paidBy: alice },
    { description: 'Seafood lunch', amount: 60, category: 'dining-out', day: 5, paidBy: bob },
    { description: 'Museum tickets', amount: 45, category: 'education', day: 8, paidBy: alice },
    { description: 'Street food', amount: 33, category: 'dining-out', day: 11, paidBy: bob },
    { description: 'Beach umbrellas', amount: 36, category: 'sports', day: 15, paidBy: alice },
  ]);

  const lunchId = await createGroup(baseURL, 'Office Lunch', owner, [carol], 'office-lunch.jpeg');
  await addExpenses(baseURL, lunchId, owner, [owner, carol], [
    { description: 'Lunch trays', amount: 24, category: 'dining-out', day: 17, paidBy: owner },
  ]);

  return { ownerToken: owner.token, veniceId, palermoId, lunchId };
}
