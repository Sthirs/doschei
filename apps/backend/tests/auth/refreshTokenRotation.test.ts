/**
 * The refresh-token rotation state machine (ADR-0023).
 *
 * This is the security-critical part of the feature, so every branch of
 * `RotationOutcome` is pinned here, plus the two properties that make the
 * design work:
 *
 *   1. A successor inherits the family and gets a FRESH expiry — that is what
 *      makes the 90-day window slide instead of counting down from the first
 *      login, and therefore what delivers "never sign in again".
 *   2. Reuse revokes the whole family, EXCEPT inside the grace window, which
 *      absorbs the benign multi-tab race. The grace branch must still issue no
 *      token — it suppresses the revocation, not the denial.
 *
 * `data-source` is mocked with an in-memory store that quacks like the narrow
 * TypeORM surface the service uses (mirrors the pattern in
 * tests/auth/auth-controller.test.ts and tests/oauth/oauth-flow-contract.test.ts).
 */
import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the `vi.mock` factory below (which Vitest lifts to the top of the
// file) can close over them.
const { GRACE_SECONDS, TTL_SECONDS } = vi.hoisted(() => ({
  GRACE_SECONDS: 30,
  TTL_SECONDS: 7776000,
}));

vi.mock('../../src/config/env', () => ({
  env: {
    REFRESH_TOKEN_TTL_SECONDS: TTL_SECONDS,
    REFRESH_TOKEN_REUSE_GRACE_SECONDS: GRACE_SECONDS,
  },
}));

type Row = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  replacedById: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
};

const { store, calls } = vi.hoisted(() => ({
  store: [] as unknown[],
  calls: { locks: [] as string[], updates: [] as unknown[] },
}));

vi.mock('../../src/db/data-source', () => {
  const rows = store as Row[];

  const repository = {
    createQueryBuilder() {
      let wanted: string | undefined;
      const builder = {
        where(_sql: string, params: { tokenHash: string }) {
          wanted = params.tokenHash;
          return builder;
        },
        setLock(mode: string) {
          calls.locks.push(mode);
          return builder;
        },
        async getOne() {
          return rows.find((row) => row.tokenHash === wanted) ?? null;
        },
      };
      return builder;
    },
    create(data: Partial<Row>) {
      return { ...data } as Row;
    },
    async save(row: Row) {
      const withId: Row = { ...row, id: row.id ?? randomUUID() };
      const index = rows.findIndex((r) => r.id === withId.id);
      if (index >= 0) rows[index] = withId;
      else rows.push(withId);
      return withId;
    },
    async update(
      criteria: { familyId: string; revokedAt: unknown },
      patch: Partial<Row>,
    ) {
      calls.updates.push(criteria);
      for (const row of rows) {
        // The real criteria is `{ familyId, revokedAt: IsNull() }`; the
        // IsNull() operator is honoured here as "not already revoked".
        if (row.familyId === criteria.familyId && row.revokedAt === null) {
          Object.assign(row, patch);
        }
      }
    },
  };

  const manager = { getRepository: () => repository };

  return {
    AppDataSource: {
      manager,
      getRepository: () => repository,
      transaction: async (cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
    },
    initializeDatabase: vi.fn(async () => undefined),
  };
});

import { hashRefreshSecret } from '../../src/services/refreshToken/refreshTokenSecrets';
import {
  issueRefreshToken,
  revokeFamilyByRawToken,
  rotateRefreshToken,
} from '../../src/services/refreshToken/refreshTokenRotation';

const rows = store as Row[];
const findRaw = (raw: string) =>
  rows.find((row) => row.tokenHash === hashRefreshSecret(raw));

/** Seed a row directly so a test can start from any lifecycle state. */
const seed = (overrides: Partial<Row> = {}): { raw: string; row: Row } => {
  const raw = `raw-${randomUUID()}`;
  const row: Row = {
    id: randomUUID(),
    userId: 'user-1',
    familyId: randomUUID(),
    tokenHash: hashRefreshSecret(raw),
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
    rotatedAt: null,
    replacedById: null,
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
  rows.push(row);
  return { raw, row };
};

beforeEach(() => {
  rows.length = 0;
  calls.locks.length = 0;
  calls.updates.length = 0;
});

describe('issueRefreshToken', () => {
  it('stores only the digest — never the raw secret', async () => {
    const { raw } = await issueRefreshToken('user-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashRefreshSecret(raw));
    expect(JSON.stringify(rows[0])).not.toContain(raw);
  });

  it('starts a fresh family, unrotated and unrevoked', async () => {
    await issueRefreshToken('user-1');
    await issueRefreshToken('user-1');

    expect(rows[0]?.familyId).not.toBe(rows[1]?.familyId);
    expect(rows[0]).toMatchObject({ rotatedAt: null, revokedAt: null });
  });

  it('expires REFRESH_TOKEN_TTL_SECONDS from now', async () => {
    const { expiresAt } = await issueRefreshToken('user-1');
    const expected = Date.now() + TTL_SECONDS * 1000;

    expect(Math.abs(expiresAt.getTime() - expected)).toBeLessThan(5000);
  });
});

describe('rotateRefreshToken — happy path', () => {
  it('rotates, keeping the family and issuing a NEW secret', async () => {
    const { raw, row } = seed();

    const outcome = await rotateRefreshToken(raw);

    expect(outcome.kind).toBe('rotated');
    if (outcome.kind !== 'rotated') return;
    expect(outcome.userId).toBe('user-1');
    expect(outcome.raw).not.toBe(raw);

    const successor = findRaw(outcome.raw);
    expect(successor?.familyId).toBe(row.familyId);
    expect(successor?.rotatedAt).toBeNull();
  });

  it('consumes the presented row and links it to its successor', async () => {
    const { raw, row } = seed();

    const outcome = await rotateRefreshToken(raw);
    if (outcome.kind !== 'rotated') throw new Error('expected rotation');

    expect(row.rotatedAt).toBeInstanceOf(Date);
    expect(row.replacedById).toBe(findRaw(outcome.raw)?.id);
  });

  it('gives the successor a FRESH expiry — the sliding window', async () => {
    // A token one day from expiring must hand out a successor good for the
    // full TTL again. Without this the session would still die 90 days after
    // the original sign-in, no matter how often it was used.
    const nearlyExpired = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { raw } = seed({ expiresAt: nearlyExpired });

    const outcome = await rotateRefreshToken(raw);
    if (outcome.kind !== 'rotated') throw new Error('expected rotation');

    expect(outcome.expiresAt.getTime()).toBeGreaterThan(
      nearlyExpired.getTime(),
    );
    expect(
      Math.abs(outcome.expiresAt.getTime() - (Date.now() + TTL_SECONDS * 1000)),
    ).toBeLessThan(5000);
  });

  it('takes a write lock so two concurrent refreshes serialize', async () => {
    const { raw } = seed();
    await rotateRefreshToken(raw);

    expect(calls.locks).toEqual(['pessimistic_write']);
  });

  it('supports a chain of rotations', async () => {
    let { raw } = seed();
    const firstFamily = findRaw(raw)?.familyId;

    for (let i = 0; i < 3; i += 1) {
      const outcome = await rotateRefreshToken(raw);
      if (outcome.kind !== 'rotated') throw new Error(`stopped at ${i}`);
      raw = outcome.raw;
    }

    expect(findRaw(raw)?.familyId).toBe(firstFamily);
    expect(rows).toHaveLength(4);
  });
});

describe('rotateRefreshToken — denials', () => {
  it('returns not-found for an unknown secret, without revoking anything', async () => {
    seed();

    expect(await rotateRefreshToken('never-issued')).toEqual({
      kind: 'not-found',
    });
    expect(calls.updates).toHaveLength(0);
  });

  it('returns expired for a live-but-past-expiry token', async () => {
    const { raw } = seed({ expiresAt: new Date(Date.now() - 1000) });

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'expired' });
  });

  it('returns revoked for an explicitly revoked token', async () => {
    const { raw } = seed({
      revokedAt: new Date(),
      revokedReason: 'logout',
    });

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'revoked' });
  });

  it('issues no token on any denial', async () => {
    const { raw } = seed({ expiresAt: new Date(Date.now() - 1000) });
    const before = rows.length;

    await rotateRefreshToken(raw);

    expect(rows).toHaveLength(before);
  });
});

describe('rotateRefreshToken — reuse detection', () => {
  it('treats an immediate replay as a race and KEEPS the family', async () => {
    const { raw, row } = seed({ rotatedAt: new Date() });
    const sibling = seed({ familyId: row.familyId });

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'race' });
    expect(calls.updates).toHaveLength(0);
    expect(sibling.row.revokedAt).toBeNull();
  });

  it('still issues no token on the race branch', async () => {
    const { raw } = seed({ rotatedAt: new Date() });
    const before = rows.length;

    await rotateRefreshToken(raw);

    expect(rows).toHaveLength(before);
  });

  it('leaves the live successor usable after a race', async () => {
    const { raw } = seed();
    const first = await rotateRefreshToken(raw);
    if (first.kind !== 'rotated') throw new Error('expected rotation');

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'race' });
    expect((await rotateRefreshToken(first.raw)).kind).toBe('rotated');
  });

  it('treats a replay outside the grace window as theft and revokes the family', async () => {
    const rotatedAt = new Date(Date.now() - (GRACE_SECONDS + 60) * 1000);
    const { raw, row } = seed({ rotatedAt });
    const sibling = seed({ familyId: row.familyId });
    const unrelated = seed();

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'reuse' });

    expect(sibling.row.revokedAt).toBeInstanceOf(Date);
    expect(sibling.row.revokedReason).toBe('reuse');
    // Blast radius is the family, not the user's other sessions.
    expect(unrelated.row.revokedAt).toBeNull();
  });

  it('guards the family revoke on revoked_at IS NULL so the first reason wins', async () => {
    const rotatedAt = new Date(Date.now() - (GRACE_SECONDS + 60) * 1000);
    const { raw } = seed({ rotatedAt });

    await rotateRefreshToken(raw);

    expect(calls.updates[0]).toMatchObject({ revokedAt: expect.anything() });
  });

  it('reports an explicit revocation as revoked, not reuse', async () => {
    // A family already killed by reuse detection, replayed again: the
    // revocation outranks the rotation marker.
    const { raw } = seed({
      rotatedAt: new Date(Date.now() - 999999),
      revokedAt: new Date(),
      revokedReason: 'reuse',
    });

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'revoked' });
  });
});

describe('revokeFamilyByRawToken', () => {
  it('revokes every live row in the family with reason logout', async () => {
    const { raw, row } = seed();
    const sibling = seed({ familyId: row.familyId });
    const unrelated = seed();

    await revokeFamilyByRawToken(raw);

    expect(row.revokedReason).toBe('logout');
    expect(sibling.row.revokedReason).toBe('logout');
    expect(unrelated.row.revokedAt).toBeNull();
  });

  it('is a silent no-op for an unknown token, so logout is idempotent', async () => {
    seed();

    await expect(revokeFamilyByRawToken('never-issued')).resolves.toBeUndefined();
    expect(calls.updates).toHaveLength(0);
  });

  it('does not take a row lock outside a transaction', async () => {
    const { raw } = seed();
    await revokeFamilyByRawToken(raw);

    expect(calls.locks).toHaveLength(0);
  });

  it('makes a revoked token unusable for refresh', async () => {
    const { raw } = seed();

    await revokeFamilyByRawToken(raw);

    expect(await rotateRefreshToken(raw)).toEqual({ kind: 'revoked' });
  });
});
