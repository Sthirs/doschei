/**
 * Unit tests for the auth controller's `PATCH /api/auth/me` handler.
 *
 * Drives the controller via supertest against `createApp()`, with the
 * `data-source` module mocked so no real Postgres connection is required.
 * This mirrors the `oauth-controller.test.ts` pattern (controller-level
 * behavior, service-level stubbing via the real `AuthService`).
 *
 * Three contracts are pinned here:
 *
 *  1. Language-only updates are accepted (`{ language: 'it' }` → 200).
 *     This is the new behavior enabled by ADR-0018 (D3): the user can
 *     switch language from the Account screen without touching their
 *     display name.
 *
 *  2. The handler rejects when BOTH `displayName` and `language` are
 *     absent. The "at least one field must be provided" rule is the
 *     PRD-0018 hardening of the ADR-0013 PATCH endpoint — without it
 *     a silent 200 no-op on an empty body would be the worst-of-both:
 *     a successful response that changed nothing.
 *
 *  3. The validation still rejects empty / over-long `displayName`
 *     values exactly as before (ADR-0013 contract).
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';

// Mock the data-source module so `AuthService`'s constructor (which calls
// `AppDataSource.getRepository(User)` eagerly) does not try to open a
// real Postgres connection. The in-memory repo we inject below returns
// a single fixed user — enough to satisfy `requireAuth`'s
// `authService.findById(payload.userId)` lookup. We then let the
// controller's validation logic run; the `updateName` service method
// is invoked only when validation passes, and the mock repo's `save`
// echoes the entity back.
vi.mock('../../src/db/data-source', () => {
  const storedUser = {
    id: 'u1',
    email: 'u@doschei.local',
    passwordHash: 'hashed',
    displayName: 'Original Name',
    language: 'en',
  };
  const repo = {
    rows: [storedUser],
    async findOne({
      where,
    }: {
      where: Partial<typeof storedUser>;
    }) {
      return (
        this.rows.find((row) =>
          Object.entries(where).every(
            ([key, value]) =>
              (row as Record<string, unknown>)[key] === value,
          ),
        ) ?? null
      );
    },
    create(data: Partial<typeof storedUser>) {
      return { ...storedUser, ...data } as typeof storedUser;
    },
    async save(entity: typeof storedUser) {
      const idx = this.rows.findIndex((r: typeof storedUser) => r.id === entity.id);
      if (idx >= 0) this.rows[idx] = entity;
      else this.rows.push(entity);
      return entity;
    },
  };
  return {
    AppDataSource: {
      getRepository: vi.fn(() => repo),
      transaction: vi.fn(),
    },
    initializeDatabase: vi.fn(async () => undefined),
  };
});

const JWT_SECRET = 'change-me-in-real-environments';

function bearerAuth(userId = 'u1') {
  return {
    Authorization: `Bearer ${jwt.sign({ userId, email: 'u@doschei.local' }, JWT_SECRET)}`,
  };
}

describe('PATCH /api/auth/me — language preference (ADR-0018 D3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a language-only update and reflects it in the sanitized user', async () => {
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/me')
      .set(bearerAuth())
      .send({ language: 'it' });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: 'u1',
      email: 'u@doschei.local',
      language: 'it',
    });
  });

  it('accepts a displayName-only update (regression: ADR-0013 contract intact)', async () => {
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/me')
      .set(bearerAuth())
      .send({ displayName: 'Updated Name' });

    expect(response.status).toBe(200);
    expect(response.body.user.displayName).toBe('Updated Name');
  });

  it('rejects when both displayName and language are absent with 400 mentioning "at least one"', async () => {
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/me')
      .set(bearerAuth())
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/at least one/i);
  });

  it('rejects empty / whitespace / over-long displayName exactly as before', async () => {
    const app = createApp();
    for (const displayName of ['   ', 'a'.repeat(101)]) {
      const response = await request(app)
        .patch('/api/auth/me')
        .set(bearerAuth())
        .send({ displayName });
      expect(response.status).toBe(400);
    }
  });

  // ---- ADR-0018 D3 strict-language contract (PATCH is explicit user choice) ----

  it('accepts PATCH with language="it-IT" (region tolerated) and stores language="it"', async () => {
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/me')
      .set(bearerAuth())
      .send({ language: 'it-IT' });

    expect(response.status).toBe(200);
    expect(response.body.user.language).toBe('it');
  });

  it('rejects PATCH with unsupported language="fr" with 400', async () => {
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/me')
      .set(bearerAuth())
      .send({ language: 'fr' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/en.*it|it.*en/);
  });

  it('rejects PATCH with non-string language=123 with 400', async () => {
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/me')
      .set(bearerAuth())
      .send({ language: 123 });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/en.*it|it.*en/);
  });
});
