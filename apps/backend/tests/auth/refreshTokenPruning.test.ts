/**
 * Retention of consumed and expired refresh-token rows (ADR-0023).
 *
 * Scope note, deliberately narrow: the prune is a single `DELETE ... WHERE`
 * evaluated by Postgres, so what can honestly be unit-tested is the query the
 * service *constructs* — the clauses and the cutoff it binds. Whether Postgres
 * then deletes the right rows is Postgres's contract, not this module's, and
 * re-implementing the predicate in a fake repository would only test the fake.
 *
 * The cutoff is the part worth pinning: consumed rows must outlive their own
 * usefulness, because a replayed token can only be RECOGNISED as reuse while
 * its row still exists. Pruning too eagerly would silently downgrade reuse
 * detection to "unknown token".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captured } = vi.hoisted(() => ({
  captured: {
    where: [] as Array<{ sql: string; params: Record<string, unknown> }>,
    from: [] as string[],
    deleteCalled: 0,
  },
}));

vi.mock('../../src/db/data-source', () => {
  const builder = {
    delete() {
      captured.deleteCalled += 1;
      return builder;
    },
    from(entity: { name: string }) {
      captured.from.push(entity.name);
      return builder;
    },
    where(sql: string, params: Record<string, unknown>) {
      captured.where.push({ sql, params });
      return builder;
    },
    orWhere(sql: string, params: Record<string, unknown>) {
      captured.where.push({ sql, params });
      return builder;
    },
    async execute() {
      return { affected: 3 };
    },
  };

  return {
    AppDataSource: {
      getRepository: () => ({ createQueryBuilder: () => builder }),
    },
    initializeDatabase: vi.fn(async () => undefined),
  };
});

import { pruneExpiredRefreshTokens } from '../../src/services/refreshToken/refreshTokenPruning';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  captured.where.length = 0;
  captured.from.length = 0;
  captured.deleteCalled = 0;
});

describe('pruneExpiredRefreshTokens', () => {
  it('deletes from refresh_tokens only', async () => {
    await pruneExpiredRefreshTokens();

    expect(captured.deleteCalled).toBe(1);
    expect(captured.from).toEqual(['RefreshToken']);
  });

  it('targets consumed rows and expired rows, and nothing else', async () => {
    await pruneExpiredRefreshTokens();

    const clauses = captured.where.map((clause) => clause.sql);
    expect(clauses).toEqual([
      'rotated_at IS NOT NULL AND rotated_at < :cutoff',
      'expires_at < :cutoff',
    ]);
  });

  it('keeps consumed rows for seven days so reuse stays detectable', async () => {
    const before = Date.now();
    await pruneExpiredRefreshTokens();

    for (const clause of captured.where) {
      const cutoff = clause.params.cutoff as Date;
      expect(cutoff).toBeInstanceOf(Date);
      // Seven days back, give or take the time this test took to run.
      expect(before - SEVEN_DAYS_MS - cutoff.getTime()).toBeLessThan(5000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(before - SEVEN_DAYS_MS);
    }
  });

  it('never prunes a still-live token: the cutoff is in the past', async () => {
    await pruneExpiredRefreshTokens();

    const cutoff = captured.where[0]?.params.cutoff as Date;
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });

  it('reports how many rows went', async () => {
    expect(await pruneExpiredRefreshTokens()).toBe(3);
  });
});
