import { randomUUID } from 'node:crypto';

import { IsNull, type EntityManager, type Repository } from 'typeorm';

import { env } from '../../config/env';
import { AppDataSource } from '../../db/data-source';
import { RefreshToken } from '../../entities/RefreshToken';
import {
  generateRefreshSecret,
  hashRefreshSecret,
  refreshSecretsMatch,
} from './refreshTokenSecrets';

/** What the caller must hand to the browser after an issue or a rotation. */
export type IssuedRefreshToken = {
  raw: string;
  expiresAt: Date;
};

/**
 * The result of presenting a refresh token, as a discriminated union so the
 * controller maps outcomes to status codes without ever inspecting row state
 * itself (ADR-0023).
 */
export type RotationOutcome =
  | { kind: 'rotated'; userId: string; raw: string; expiresAt: Date }
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'race' }
  | { kind: 'reuse' };

export type RevocationReason = 'logout' | 'reuse';

const refreshTokenLifetimeMs = (): number =>
  env.REFRESH_TOKEN_TTL_SECONDS * 1000;

/**
 * Insert one link of a chain. `familyId` is omitted to start a new family
 * (a fresh login) and passed through to keep a rotation in the same lineage.
 *
 * `expiresAt` is computed from *now* on every insert — that is what makes the
 * refresh window slide forward on each use rather than counting down from the
 * original login.
 */
const insertRefreshToken = async (
  manager: EntityManager,
  userId: string,
  familyId?: string,
): Promise<IssuedRefreshToken & { id: string }> => {
  const repository = manager.getRepository(RefreshToken);
  const raw = generateRefreshSecret();
  const expiresAt = new Date(Date.now() + refreshTokenLifetimeMs());

  const saved = await repository.save(
    repository.create({
      userId,
      familyId: familyId ?? randomUUID(),
      tokenHash: hashRefreshSecret(raw),
      expiresAt,
      rotatedAt: null,
      replacedById: null,
      revokedAt: null,
      revokedReason: null,
    }),
  );

  return { id: saved.id, raw, expiresAt };
};

/**
 * Revoke every still-live row in a family. Used by logout and by reuse
 * detection; the `revoked_at IS NULL` guard keeps the original revocation
 * timestamp and reason when a family is revoked twice.
 */
const revokeFamily = async (
  repository: Repository<RefreshToken>,
  familyId: string,
  reason: RevocationReason,
  now: Date,
): Promise<void> => {
  await repository.update(
    { familyId, revokedAt: IsNull() },
    { revokedAt: now, revokedReason: reason },
  );
};

const findByRawToken = async (
  repository: Repository<RefreshToken>,
  raw: string,
  lock: boolean,
): Promise<RefreshToken | null> => {
  const tokenHash = hashRefreshSecret(raw);
  const query = repository
    .createQueryBuilder('token')
    .where('token.tokenHash = :tokenHash', { tokenHash });

  if (lock) {
    // FOR UPDATE: two tabs POSTing the same cookie at the same instant must
    // serialize here, so exactly one of them can rotate the row.
    query.setLock('pessimistic_write');
  }

  const found = await query.getOne();
  if (!found) return null;

  // Belt and braces: re-compare in constant time so no code path relies on
  // the unique index alone.
  return refreshSecretsMatch(found.tokenHash, tokenHash) ? found : null;
};

/** Start a new refresh-token family for a freshly authenticated user. */
export const issueRefreshToken = async (
  userId: string,
): Promise<IssuedRefreshToken> => {
  const { raw, expiresAt } = await insertRefreshToken(
    AppDataSource.manager,
    userId,
  );
  return { raw, expiresAt };
};

/**
 * Exchange a refresh token for a successor plus a fresh access token.
 *
 * Runs in one transaction with a row lock on the presented token. Order of
 * checks matters: an explicit revocation outranks a rotation, and expiry is
 * only considered for a token that has not been consumed — a rotated token
 * that has since expired is still a reuse signal, not an expiry.
 */
export const rotateRefreshToken = async (
  raw: string,
): Promise<RotationOutcome> =>
  AppDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(RefreshToken);
    const existing = await findByRawToken(repository, raw, true);

    if (!existing) return { kind: 'not-found' };

    const now = new Date();

    if (existing.revokedAt) return { kind: 'revoked' };

    if (existing.rotatedAt) {
      const sinceRotationMs = now.getTime() - existing.rotatedAt.getTime();
      const graceMs = env.REFRESH_TOKEN_REUSE_GRACE_SECONDS * 1000;

      // Benign multi-tab race (or a retried request whose response was lost):
      // deny, but keep the family — the sibling tab holds the live successor.
      // Note this branch still issues NO token, so a thief replaying inside
      // the window gains nothing; only the revocation is suppressed.
      if (sinceRotationMs <= graceMs) return { kind: 'race' };

      await revokeFamily(repository, existing.familyId, 'reuse', now);
      return { kind: 'reuse' };
    }

    if (existing.expiresAt.getTime() <= now.getTime()) {
      return { kind: 'expired' };
    }

    const successor = await insertRefreshToken(
      manager,
      existing.userId,
      existing.familyId,
    );

    existing.rotatedAt = now;
    existing.replacedById = successor.id;
    await repository.save(existing);

    return {
      kind: 'rotated',
      userId: existing.userId,
      raw: successor.raw,
      expiresAt: successor.expiresAt,
    };
  });

/**
 * Revoke the family the given token belongs to. Idempotent and silent when
 * the token is unknown, so logout can never fail on a stale cookie.
 */
export const revokeFamilyByRawToken = async (raw: string): Promise<void> => {
  const repository = AppDataSource.getRepository(RefreshToken);
  const existing = await findByRawToken(repository, raw, false);
  if (!existing) return;
  await revokeFamily(repository, existing.familyId, 'logout', new Date());
};
