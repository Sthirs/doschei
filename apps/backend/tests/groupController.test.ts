/**
 * Characterization tests for `groupController.ts` (todo 9,
 * `.omo/plans/remove-ai-slop.md`).
 *
 * Purpose: pin the CURRENT validation and status-code behavior of all 17
 * exported handlers at UNIT level — no cluster, no Postgres — so the
 * upcoming controller split (todo 18) and the `request.auth!`
 * type-narrowing (todo 19) have a local safety net. These tests do not
 * judge whether a given status code is "correct"; they lock what the
 * code does TODAY.
 *
 * Strategy: drive the real Express app (`createApp()`) via supertest so
 * routing + `requireAuth` + multer middleware are exercised exactly as
 * in production, but stub every service-layer call with
 * `vi.spyOn(...prototype, ...)` (matching the established pattern in
 * `tests/oauth/oauth-controller.test.ts`). `GroupService` and
 * `AuthService` both read a TypeORM repository in a field initializer
 * that runs at construction time (the controllers construct singletons
 * at module load), so `../src/db/data-source` is mocked FIRST to avoid
 * touching real Postgres.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/data-source', () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({})),
    transaction: vi.fn(),
  },
  initializeDatabase: vi.fn(async () => undefined),
}));

vi.mock('../src/services/imageService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/services/imageService')>();
  return {
    ...actual,
    normalizeToDataUrl: vi.fn(),
  };
});

import { createApp } from '../src/app';
import { AuthService } from '../src/services/authService';
import { GroupService } from '../src/services/groupService';
import { invitationService } from '../src/services/invitationService';
import {
  normalizeToDataUrl,
  UnsupportedImageTypeError,
} from '../src/services/imageService';

const JWT_SECRET = 'change-me-in-real-environments';
const AUTH_USER = {
  id: 'u1',
  email: 'u@doschei.local',
  displayName: 'U',
  language: 'en' as const,
};

function bearerAuth(userId = 'u1') {
  return {
    Authorization: `Bearer ${jwt.sign({ userId, email: AUTH_USER.email }, JWT_SECRET)}`,
  };
}

describe('groupController (unit, service layer mocked)', () => {
  beforeEach(() => {
    vi.spyOn(AuthService.prototype, 'findById').mockResolvedValue(
      AUTH_USER as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // listGroups — GET /api/groups
  // ---------------------------------------------------------------
  describe('listGroups', () => {
    it('happy: 200 with { groups, invitations }', async () => {
      vi.spyOn(GroupService.prototype, 'getGroupsForUser').mockResolvedValue([
        { id: 'g1' },
      ] as never);
      vi.spyOn(invitationService, 'listPendingForInvitee').mockResolvedValue([
        { id: 'i1' },
      ] as never);

      const app = createApp();
      const response = await request(app).get('/api/groups').set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        groups: [{ id: 'g1' }],
        invitations: [{ id: 'i1' }],
      });
    });

    it('error branch: unauthenticated request → 401 (no handler-level try/catch exists)', async () => {
      const app = createApp();
      const response = await request(app).get('/api/groups');

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/missing bearer token/i);
    });
  });

  // ---------------------------------------------------------------
  // getGroup — GET /api/groups/:id
  // ---------------------------------------------------------------
  describe('getGroup', () => {
    it('happy: 200 with { group }', async () => {
      vi.spyOn(GroupService.prototype, 'getGroupByIdForUser').mockResolvedValue(
        { id: 'g1' } as never,
      );

      const app = createApp();
      const response = await request(app)
        .get('/api/groups/g1')
        .set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ group: { id: 'g1' } });
    });

    it('error branch: service returns null → 404 { message: "Group not found." }', async () => {
      vi.spyOn(GroupService.prototype, 'getGroupByIdForUser').mockResolvedValue(
        null as never,
      );

      const app = createApp();
      const response = await request(app)
        .get('/api/groups/missing')
        .set(bearerAuth());

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Group not found.' });
    });
  });

  // ---------------------------------------------------------------
  // createGroup — POST /api/groups
  // ---------------------------------------------------------------
  describe('createGroup', () => {
    it('happy: 201 with { group }', async () => {
      vi.spyOn(GroupService.prototype, 'createGroupForUser').mockResolvedValue({
        id: 'g1',
        name: 'Trip',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups')
        .set(bearerAuth())
        .send({ name: 'Trip' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ group: { id: 'g1', name: 'Trip' } });
    });

    it('error branch: missing/blank name → 400 (validation, before service call)', async () => {
      const spy = vi.spyOn(GroupService.prototype, 'createGroupForUser');
      const app = createApp();

      const missing = await request(app)
        .post('/api/groups')
        .set(bearerAuth())
        .send({});
      expect(missing.status).toBe(400);
      expect(missing.body).toEqual({ message: 'Group name is required.' });

      const blank = await request(app)
        .post('/api/groups')
        .set(bearerAuth())
        .send({ name: '   ' });
      expect(blank.status).toBe(400);
      expect(spy).not.toHaveBeenCalled();
    });

    it('error branch: service throws → 400 with the thrown message', async () => {
      vi.spyOn(GroupService.prototype, 'createGroupForUser').mockRejectedValue(
        new Error('boom'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/groups')
        .set(bearerAuth())
        .send({ name: 'Trip' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'boom' });
    });
  });

  // ---------------------------------------------------------------
  // createExpense — POST /api/groups/:id/expenses
  // ---------------------------------------------------------------
  describe('createExpense', () => {
    const validBody = {
      description: 'Dinner',
      amount: 50,
      date: '2026-06-01',
      category: 'groceries',
    };

    it('happy: 201 with { expense }', async () => {
      vi.spyOn(
        GroupService.prototype,
        'createExpenseForGroup',
      ).mockResolvedValue({ id: 'e1' } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/expenses')
        .set(bearerAuth())
        .send(validBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ expense: { id: 'e1' } });
    });

    it('error branch: missing description → 400', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/expenses')
        .set(bearerAuth())
        .send({ ...validBody, description: '' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Description is required.' });
    });

    it('error branch: non-positive amount → 400', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/expenses')
        .set(bearerAuth())
        .send({ ...validBody, amount: 0 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Valid amount greater than 0 is required.',
      });
    });

    it('error branch: invalid category rejected — pins VALID_EXPENSE_CATEGORIES membership check', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/expenses')
        .set(bearerAuth())
        .send({ ...validBody, category: 'not-a-real-category' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Category must be one of the supported values.',
      });
    });

    it('error branch: invalid date format → 400', async () => {
      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/expenses')
        .set(bearerAuth())
        .send({ ...validBody, date: 'not-a-date' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Valid expense date is required.',
      });
    });

    it('error branch: service throws → 400 with thrown message', async () => {
      vi.spyOn(
        GroupService.prototype,
        'createExpenseForGroup',
      ).mockRejectedValue(new Error('split mismatch'));

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/expenses')
        .set(bearerAuth())
        .send(validBody);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'split mismatch' });
    });
  });

  // ---------------------------------------------------------------
  // updateExpense — PATCH /api/groups/:id/expenses/:expenseId
  // ---------------------------------------------------------------
  describe('updateExpense', () => {
    it('happy: 200 with { expense }', async () => {
      vi.spyOn(
        GroupService.prototype,
        'updateExpenseForGroup',
      ).mockResolvedValue({ id: 'e1', amount: 10 } as never);

      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1/expenses/e1')
        .set(bearerAuth())
        .send({ amount: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ expense: { id: 'e1', amount: 10 } });
    });

    it('error branch: invalid category → 400 without calling the service', async () => {
      const spy = vi.spyOn(GroupService.prototype, 'updateExpenseForGroup');
      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1/expenses/e1')
        .set(bearerAuth())
        .send({ category: 'bogus' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Category must be one of the supported values.',
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('404-vs-400 discrimination: service throws "...not found..." → 404', async () => {
      vi.spyOn(
        GroupService.prototype,
        'updateExpenseForGroup',
      ).mockRejectedValue(new Error('Expense not found.'));

      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1/expenses/e1')
        .set(bearerAuth())
        .send({ amount: 5 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Expense not found.' });
    });

    it('404-vs-400 discrimination: service throws "...own expenses..." → 404', async () => {
      vi.spyOn(
        GroupService.prototype,
        'updateExpenseForGroup',
      ).mockRejectedValue(new Error('You can only edit your own expenses.'));

      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1/expenses/e1')
        .set(bearerAuth())
        .send({ amount: 5 });

      expect(response.status).toBe(404);
    });

    it('404-vs-400 discrimination: any other thrown message → 400', async () => {
      vi.spyOn(
        GroupService.prototype,
        'updateExpenseForGroup',
      ).mockRejectedValue(new Error('Split values invalid.'));

      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1/expenses/e1')
        .set(bearerAuth())
        .send({ amount: 5 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Split values invalid.' });
    });
  });

  // ---------------------------------------------------------------
  // deleteExpense — DELETE /api/groups/:id/expenses/:expenseId
  // ---------------------------------------------------------------
  describe('deleteExpense', () => {
    it('happy: 204 no body', async () => {
      vi.spyOn(
        GroupService.prototype,
        'deleteExpenseForGroup',
      ).mockResolvedValue(undefined as never);

      const app = createApp();
      const response = await request(app)
        .delete('/api/groups/g1/expenses/e1')
        .set(bearerAuth());

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
    });

    it('404-vs-400 discrimination: "not found" → 404, otherwise → 400', async () => {
      vi.spyOn(
        GroupService.prototype,
        'deleteExpenseForGroup',
      ).mockRejectedValueOnce(new Error('Expense not found.'));
      const app = createApp();

      const notFound = await request(app)
        .delete('/api/groups/g1/expenses/e1')
        .set(bearerAuth());
      expect(notFound.status).toBe(404);

      vi.spyOn(
        GroupService.prototype,
        'deleteExpenseForGroup',
      ).mockRejectedValueOnce(new Error('Nope.'));
      const generic = await request(app)
        .delete('/api/groups/g1/expenses/e1')
        .set(bearerAuth());
      expect(generic.status).toBe(400);
      expect(generic.body).toEqual({ message: 'Nope.' });
    });
  });

  // ---------------------------------------------------------------
  // createSettlement — POST /api/groups/:id/settlements
  // ---------------------------------------------------------------
  describe('createSettlement', () => {
    it('happy: 201 with { expense }', async () => {
      vi.spyOn(
        GroupService.prototype,
        'createSettlementForGroup',
      ).mockResolvedValue({ id: 's1' } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/settlements')
        .set(bearerAuth())
        .send({
          paidByUserId: 'u1',
          paidToUserId: 'u2',
          amount: 10,
          date: '2026-06-01',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ expense: { id: 's1' } });
    });

    it('404-vs-400 discrimination: "not found" → 404, otherwise → 400', async () => {
      vi.spyOn(
        GroupService.prototype,
        'createSettlementForGroup',
      ).mockRejectedValueOnce(new Error('Payee not found.'));
      const app = createApp();

      const notFound = await request(app)
        .post('/api/groups/g1/settlements')
        .set(bearerAuth())
        .send({});
      expect(notFound.status).toBe(404);

      vi.spyOn(
        GroupService.prototype,
        'createSettlementForGroup',
      ).mockRejectedValueOnce(new Error('Bad amount.'));
      const generic = await request(app)
        .post('/api/groups/g1/settlements')
        .set(bearerAuth())
        .send({});
      expect(generic.status).toBe(400);
      expect(generic.body).toEqual({ message: 'Bad amount.' });
    });
  });

  // ---------------------------------------------------------------
  // updateSettlement — PATCH /api/groups/:id/settlements/:settlementId
  // ---------------------------------------------------------------
  describe('updateSettlement', () => {
    it('happy: 200 with { expense }', async () => {
      vi.spyOn(
        GroupService.prototype,
        'updateSettlementForGroup',
      ).mockResolvedValue({ id: 's1' } as never);

      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1/settlements/s1')
        .set(bearerAuth())
        .send({ amount: 20 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ expense: { id: 's1' } });
    });

    it('404-vs-400 discrimination: "not found" → 404, otherwise → 400', async () => {
      vi.spyOn(
        GroupService.prototype,
        'updateSettlementForGroup',
      ).mockRejectedValueOnce(new Error('Settlement not found.'));
      const app = createApp();

      const notFound = await request(app)
        .patch('/api/groups/g1/settlements/s1')
        .set(bearerAuth())
        .send({});
      expect(notFound.status).toBe(404);

      vi.spyOn(
        GroupService.prototype,
        'updateSettlementForGroup',
      ).mockRejectedValueOnce(new Error('Bad input.'));
      const generic = await request(app)
        .patch('/api/groups/g1/settlements/s1')
        .set(bearerAuth())
        .send({});
      expect(generic.status).toBe(400);
      expect(generic.body).toEqual({ message: 'Bad input.' });
    });
  });

  // ---------------------------------------------------------------
  // deleteSettlement — DELETE /api/groups/:id/settlements/:settlementId
  // ---------------------------------------------------------------
  describe('deleteSettlement', () => {
    it('happy: 204 no body', async () => {
      vi.spyOn(
        GroupService.prototype,
        'deleteSettlementForGroup',
      ).mockResolvedValue(undefined as never);

      const app = createApp();
      const response = await request(app)
        .delete('/api/groups/g1/settlements/s1')
        .set(bearerAuth());

      expect(response.status).toBe(204);
    });

    it('404-vs-400 discrimination: "not found" → 404, otherwise → 400', async () => {
      vi.spyOn(
        GroupService.prototype,
        'deleteSettlementForGroup',
      ).mockRejectedValueOnce(new Error('Settlement not found.'));
      const app = createApp();

      const notFound = await request(app)
        .delete('/api/groups/g1/settlements/s1')
        .set(bearerAuth());
      expect(notFound.status).toBe(404);

      vi.spyOn(
        GroupService.prototype,
        'deleteSettlementForGroup',
      ).mockRejectedValueOnce(new Error('Nope.'));
      const generic = await request(app)
        .delete('/api/groups/g1/settlements/s1')
        .set(bearerAuth());
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // exportExpenses — GET /api/groups/:id/expenses/export
  // ---------------------------------------------------------------
  describe('exportExpenses', () => {
    it('happy: 200 with CSV headers set and rows written', async () => {
      vi.spyOn(GroupService.prototype, 'startExpensesCsv').mockResolvedValue({
        headers: {
          contentType: 'text/csv; charset=utf-8',
          cacheControl: 'no-store',
          contentDisposition: 'attachment; filename="export.csv"',
        },
        rows: (async function* () {
          yield 'a,b\n';
          yield '1,2\n';
        })(),
      } as never);

      const app = createApp();
      const response = await request(app)
        .get('/api/groups/g1/expenses/export?month=2026-06')
        .set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.text).toBe('a,b\n1,2\n');
    });

    it('error branch: missing/invalid month query param → 400 without calling the service', async () => {
      const spy = vi.spyOn(GroupService.prototype, 'startExpensesCsv');
      const app = createApp();
      const response = await request(app)
        .get('/api/groups/g1/expenses/export')
        .set(bearerAuth());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'A "month" query parameter (YYYY-MM) is required.',
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('error branch: service throws "Group not found" → 404', async () => {
      vi.spyOn(GroupService.prototype, 'startExpensesCsv').mockRejectedValue(
        new Error('Group not found.'),
      );

      const app = createApp();
      const response = await request(app)
        .get('/api/groups/g1/expenses/export?month=2026-06')
        .set(bearerAuth());

      expect(response.status).toBe(404);
    });

    it('error branch: service throws "Invalid month" → 400', async () => {
      vi.spyOn(GroupService.prototype, 'startExpensesCsv').mockRejectedValue(
        new Error('Invalid month value.'),
      );

      const app = createApp();
      const response = await request(app)
        .get('/api/groups/g1/expenses/export?month=2026-06')
        .set(bearerAuth());

      expect(response.status).toBe(400);
    });

    it('error branch: any other thrown error → 500 generic message', async () => {
      vi.spyOn(GroupService.prototype, 'startExpensesCsv').mockRejectedValue(
        new Error('DB exploded'),
      );

      const app = createApp();
      const response = await request(app)
        .get('/api/groups/g1/expenses/export?month=2026-06')
        .set(bearerAuth());

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Unable to export expenses.' });
    });
  });

  // ---------------------------------------------------------------
  // updateGroup — PATCH /api/groups/:id
  // ---------------------------------------------------------------
  describe('updateGroup', () => {
    it('happy: 200 with { group }', async () => {
      vi.spyOn(GroupService.prototype, 'updateGroup').mockResolvedValue({
        id: 'g1',
        name: 'New',
      } as never);

      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1')
        .set(bearerAuth())
        .send({ name: 'New' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ group: { id: 'g1', name: 'New' } });
    });

    it('error branch: missing name → 400 without calling the service', async () => {
      const spy = vi.spyOn(GroupService.prototype, 'updateGroup');
      const app = createApp();
      const response = await request(app)
        .patch('/api/groups/g1')
        .set(bearerAuth())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Group name is required.' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('404-vs-400 discrimination: "not found" → 404, otherwise → 400', async () => {
      vi.spyOn(GroupService.prototype, 'updateGroup').mockRejectedValueOnce(
        new Error('Group not found.'),
      );
      const app = createApp();

      const notFound = await request(app)
        .patch('/api/groups/g1')
        .set(bearerAuth())
        .send({ name: 'X' });
      expect(notFound.status).toBe(404);

      vi.spyOn(GroupService.prototype, 'updateGroup').mockRejectedValueOnce(
        new Error('Bad.'),
      );
      const generic = await request(app)
        .patch('/api/groups/g1')
        .set(bearerAuth())
        .send({ name: 'X' });
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // addMember — POST /api/groups/:id/members
  // ---------------------------------------------------------------
  describe('addMember', () => {
    it('happy: 201 with { invitation }', async () => {
      vi.spyOn(GroupService.prototype, 'addMemberByEmail').mockResolvedValue({
        id: 'inv1',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/members')
        .set(bearerAuth())
        .send({ email: 'a@b.com' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ invitation: { id: 'inv1' } });
    });

    it('error branch: invalid email → 400 without calling the service', async () => {
      const spy = vi.spyOn(GroupService.prototype, 'addMemberByEmail');
      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/members')
        .set(bearerAuth())
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'A valid email is required.' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('404-vs-400 discrimination: "not found" → 404, otherwise → 400', async () => {
      vi.spyOn(
        GroupService.prototype,
        'addMemberByEmail',
      ).mockRejectedValueOnce(new Error('Group not found.'));
      const app = createApp();

      const notFound = await request(app)
        .post('/api/groups/g1/members')
        .set(bearerAuth())
        .send({ email: 'a@b.com' });
      expect(notFound.status).toBe(404);

      vi.spyOn(
        GroupService.prototype,
        'addMemberByEmail',
      ).mockRejectedValueOnce(new Error('Already a member.'));
      const generic = await request(app)
        .post('/api/groups/g1/members')
        .set(bearerAuth())
        .send({ email: 'a@b.com' });
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // removeMember — DELETE /api/groups/:id/members/:userId
  // ---------------------------------------------------------------
  describe('removeMember', () => {
    it('happy: 204 no body', async () => {
      vi.spyOn(GroupService.prototype, 'removeMember').mockResolvedValue(
        undefined as never,
      );

      const app = createApp();
      const response = await request(app)
        .delete('/api/groups/g1/members/u2')
        .set(bearerAuth());

      expect(response.status).toBe(204);
    });

    it('404-vs-400 discrimination: TWO distinct "404" messages ("not found" / "not a member"), else 400', async () => {
      vi.spyOn(GroupService.prototype, 'removeMember').mockRejectedValueOnce(
        new Error('Group not found.'),
      );
      const app = createApp();

      const notFound = await request(app)
        .delete('/api/groups/g1/members/u2')
        .set(bearerAuth());
      expect(notFound.status).toBe(404);

      vi.spyOn(GroupService.prototype, 'removeMember').mockRejectedValueOnce(
        new Error('User is not a member.'),
      );
      const notMember = await request(app)
        .delete('/api/groups/g1/members/u2')
        .set(bearerAuth());
      expect(notMember.status).toBe(404);

      vi.spyOn(GroupService.prototype, 'removeMember').mockRejectedValueOnce(
        new Error('Cannot remove owner.'),
      );
      const generic = await request(app)
        .delete('/api/groups/g1/members/u2')
        .set(bearerAuth());
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // acceptInvitation — POST /api/groups/:id/invitations/:invitationId/accept
  // ---------------------------------------------------------------
  describe('acceptInvitation', () => {
    it('happy: 200 with { invitation }', async () => {
      vi.spyOn(invitationService, 'acceptInvitation').mockResolvedValue({
        id: 'inv1',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/invitations/inv1/accept')
        .set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ invitation: { id: 'inv1' } });
    });

    it('error branch: "not found" → 404, "not the invitee" → 403, else → 400', async () => {
      vi.spyOn(invitationService, 'acceptInvitation').mockRejectedValueOnce(
        new Error('Invitation not found.'),
      );
      const app = createApp();

      const notFound = await request(app)
        .post('/api/groups/g1/invitations/inv1/accept')
        .set(bearerAuth());
      expect(notFound.status).toBe(404);

      vi.spyOn(invitationService, 'acceptInvitation').mockRejectedValueOnce(
        new Error('You are not the invitee.'),
      );
      const forbidden = await request(app)
        .post('/api/groups/g1/invitations/inv1/accept')
        .set(bearerAuth());
      expect(forbidden.status).toBe(403);

      vi.spyOn(invitationService, 'acceptInvitation').mockRejectedValueOnce(
        new Error('Already accepted.'),
      );
      const generic = await request(app)
        .post('/api/groups/g1/invitations/inv1/accept')
        .set(bearerAuth());
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // declineInvitation — POST /api/groups/:id/invitations/:invitationId/decline
  // ---------------------------------------------------------------
  describe('declineInvitation', () => {
    it('happy: 200 with { invitation }', async () => {
      vi.spyOn(invitationService, 'declineInvitation').mockResolvedValue({
        id: 'inv1',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/invitations/inv1/decline')
        .set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ invitation: { id: 'inv1' } });
    });

    it('error branch: "not found" → 404, "not the invitee" → 403, else → 400', async () => {
      vi.spyOn(invitationService, 'declineInvitation').mockRejectedValueOnce(
        new Error('Invitation not found.'),
      );
      const app = createApp();

      const notFound = await request(app)
        .post('/api/groups/g1/invitations/inv1/decline')
        .set(bearerAuth());
      expect(notFound.status).toBe(404);

      vi.spyOn(invitationService, 'declineInvitation').mockRejectedValueOnce(
        new Error('You are not the invitee.'),
      );
      const forbidden = await request(app)
        .post('/api/groups/g1/invitations/inv1/decline')
        .set(bearerAuth());
      expect(forbidden.status).toBe(403);

      vi.spyOn(invitationService, 'declineInvitation').mockRejectedValueOnce(
        new Error('Already declined.'),
      );
      const generic = await request(app)
        .post('/api/groups/g1/invitations/inv1/decline')
        .set(bearerAuth());
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // cancelInvitation — DELETE /api/groups/:id/invitations/:invitationId
  // ---------------------------------------------------------------
  describe('cancelInvitation', () => {
    it('happy: 204 no body', async () => {
      vi.spyOn(invitationService, 'cancelInvitation').mockResolvedValue(
        undefined as never,
      );

      const app = createApp();
      const response = await request(app)
        .delete('/api/groups/g1/invitations/inv1')
        .set(bearerAuth());

      expect(response.status).toBe(204);
    });

    it('error branch: "not found" → 404, "not the inviter" → 403, else → 400', async () => {
      vi.spyOn(invitationService, 'cancelInvitation').mockRejectedValueOnce(
        new Error('Invitation not found.'),
      );
      const app = createApp();

      const notFound = await request(app)
        .delete('/api/groups/g1/invitations/inv1')
        .set(bearerAuth());
      expect(notFound.status).toBe(404);

      vi.spyOn(invitationService, 'cancelInvitation').mockRejectedValueOnce(
        new Error('You are not the inviter.'),
      );
      const forbidden = await request(app)
        .delete('/api/groups/g1/invitations/inv1')
        .set(bearerAuth());
      expect(forbidden.status).toBe(403);

      vi.spyOn(invitationService, 'cancelInvitation').mockRejectedValueOnce(
        new Error('Already cancelled.'),
      );
      const generic = await request(app)
        .delete('/api/groups/g1/invitations/inv1')
        .set(bearerAuth());
      expect(generic.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // updateGroupImage — POST /api/groups/:id/image
  // ---------------------------------------------------------------
  describe('updateGroupImage', () => {
    it('happy: 200 with { group }', async () => {
      vi.mocked(normalizeToDataUrl).mockResolvedValue(
        'data:image/png;base64,AAA',
      );
      vi.spyOn(GroupService.prototype, 'updateGroupImage').mockResolvedValue({
        id: 'g1',
        imageUrl: 'data:image/png;base64,AAA',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        group: { id: 'g1', imageUrl: 'data:image/png;base64,AAA' },
      });
    });

    it('error branch: no file attached → 400 without calling the service', async () => {
      const spy = vi.spyOn(GroupService.prototype, 'updateGroupImage');
      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/image')
        .set(bearerAuth());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Image file is required.' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('error branch: UnsupportedImageTypeError from normalizeToDataUrl → 415', async () => {
      vi.mocked(normalizeToDataUrl).mockRejectedValue(
        new UnsupportedImageTypeError('image/gif'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(415);
    });

    it('error branch: sharp decode failure message → 422 { message: "Invalid image file." }', async () => {
      vi.mocked(normalizeToDataUrl).mockRejectedValue(
        new Error('Input buffer contains unsupported image format'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/groups/g1/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ message: 'Invalid image file.' });
    });

    it('404-vs-400 discrimination on the group-service call: "not found" → 404, otherwise → 400', async () => {
      vi.mocked(normalizeToDataUrl).mockResolvedValue(
        'data:image/png;base64,AAA',
      );
      vi.spyOn(
        GroupService.prototype,
        'updateGroupImage',
      ).mockRejectedValueOnce(new Error('Group not found.'));
      const app = createApp();

      const notFound = await request(app)
        .post('/api/groups/g1/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });
      expect(notFound.status).toBe(404);

      vi.spyOn(
        GroupService.prototype,
        'updateGroupImage',
      ).mockRejectedValueOnce(new Error('Not an owner.'));
      const generic = await request(app)
        .post('/api/groups/g1/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });
      expect(generic.status).toBe(400);
    });
  });
});
