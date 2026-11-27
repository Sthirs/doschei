import { createJsonRequest, createMultipartRequest, uniqueValue } from './api';
import { bearer, newUser, type Split, type TestUser } from './groups';

/** A 1×1 PNG; the upload pipeline turns it into a `data:image/webp` URL. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const uploadImage = async (path: string, token: string) => {
  const formData = new FormData();
  formData.append('image', new Blob([PNG_1PX], { type: 'image/png' }), 'image.png');
  const response = await createMultipartRequest(path, formData, token);
  if (response.status !== 200) {
    throw new Error(`upload ${path} failed with ${response.status}`);
  }
};

const post = async <T>(token: string, path: string, body: unknown): Promise<T> => {
  const response = await createJsonRequest<T>(path, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify(body),
  });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }
  return response.body;
};

export const postDatedExpense = (
  token: string,
  groupId: string,
  body: { description: string; amount: number; date: string; paidByUserId: string; splits: Split[] },
) => post<{ expense: { id: string } }>(token, `/api/groups/${groupId}/expenses`, body);

export type LedgerFixture = {
  alice: TestUser;
  bob: TestUser;
  carol: TestUser;
  ledgerGroupId: string;
  emptyGroupId: string;
  invitedEmail: string;
  /** Expense ids in the expected detail order (date DESC, createdAt DESC). */
  expectedOrder: string[];
  settlementId: string;
};

/**
 * Alice and Bob — both with profile pictures — share a group that has an
 * image and a mixed ledger; Alice also owns an empty group. Carol is
 * registered and invited to the shared group but has not answered, and an
 * unregistered address has a pending invitation too.
 *
 * Ledger (net from Alice's side):
 *   2026-03-01 EQUAL   30.00 paid by Alice, Alice/Bob   → Bob owes 15.00
 *   2026-03-02 PERCENT 50.00 paid by Alice, 60/40       → Bob owes 20.00
 *   2026-03-03 FIXED   20.00 paid by Bob, 12.35/7.65    → Alice owes 12.35
 *   settlement  4.00 Bob → Alice                         → Bob owes  4.00 less
 *   Alice net = 15 + 20 − 12.35 − 4 = +18.65; Bob net = −18.65.
 */
export const ALICE_NET = 18.65;

export const createLedgerFixture = async (prefix: string): Promise<LedgerFixture> => {
  const alice = await newUser(`${prefix}-alice`);
  const bob = await newUser(`${prefix}-bob`);
  const carol = await newUser(`${prefix}-carol`);
  await uploadImage('/api/auth/me/image', alice.token);
  await uploadImage('/api/auth/me/image', bob.token);

  const { group } = await post<{ group: { id: string } }>(alice.token, '/api/groups', {
    name: uniqueValue(`${prefix}-shared`),
  });
  const ledgerGroupId = group.id;
  await uploadImage(`/api/groups/${ledgerGroupId}/image`, alice.token);

  const { invitation } = await post<{ invitation: { id: string } }>(
    alice.token,
    `/api/groups/${ledgerGroupId}/members`,
    { email: bob.user.email },
  );
  await post(bob.token, `/api/groups/${ledgerGroupId}/invitations/${invitation.id}/accept`, {});
  await post(alice.token, `/api/groups/${ledgerGroupId}/members`, { email: carol.user.email });
  const invitedEmail = `${uniqueValue(`${prefix}-pending`)}@example.test`;
  await post(alice.token, `/api/groups/${ledgerGroupId}/members`, { email: invitedEmail });

  const { group: emptyGroup } = await post<{ group: { id: string } }>(alice.token, '/api/groups', {
    name: uniqueValue(`${prefix}-empty`),
  });

  const a = alice.user.id;
  const b = bob.user.id;
  const equal = await postDatedExpense(alice.token, ledgerGroupId, {
    description: 'Groceries',
    amount: 30,
    date: '2026-03-01',
    paidByUserId: a,
    splits: [
      { userId: a, shareType: 'EQUAL', shareValue: 0 },
      { userId: b, shareType: 'EQUAL', shareValue: 0 },
    ],
  });
  const fixed = await postDatedExpense(bob.token, ledgerGroupId, {
    description: 'Fuel',
    amount: 20,
    date: '2026-03-03',
    paidByUserId: b,
    splits: [
      { userId: a, shareType: 'FIXED', shareValue: 12.35 },
      { userId: b, shareType: 'FIXED', shareValue: 7.65 },
    ],
  });
  const percent = await postDatedExpense(alice.token, ledgerGroupId, {
    description: 'Hotel',
    amount: 50,
    date: '2026-03-02',
    paidByUserId: a,
    splits: [
      { userId: a, shareType: 'PERCENT', shareValue: 60 },
      { userId: b, shareType: 'PERCENT', shareValue: 40 },
    ],
  });
  const settlement = await post<{ expense: { id: string } }>(
    bob.token,
    `/api/groups/${ledgerGroupId}/settlements`,
    { paidToUserId: a, amount: 4 },
  );

  return {
    alice,
    bob,
    carol,
    ledgerGroupId,
    emptyGroupId: emptyGroup.id,
    invitedEmail,
    // The settlement is dated today, so it sorts first.
    expectedOrder: [settlement.expense.id, fixed.expense.id, percent.expense.id, equal.expense.id],
    settlementId: settlement.expense.id,
  };
};

export const SERIALIZED_EXPENSE_KEYS = [
  'amount',
  'category',
  'createdAt',
  'date',
  'description',
  'id',
  'kind',
  'paidByName',
  'paidByUserId',
  'settledWithName',
  'settledWithUserId',
  'splits',
];

export const SERIALIZED_SPLIT_KEYS = ['computedAmount', 'displayName', 'shareType', 'shareValue', 'userId'];

export const DATA_URL = /^data:image\/webp;base64,/;
