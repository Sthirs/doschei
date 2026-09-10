import { AppDataSource } from '../../db/data-source';
import { RefreshToken } from '../../entities/RefreshToken';

/**
 * How long a consumed or expired row is kept before deletion.
 *
 * Rotated rows must outlive their own usefulness for a while: they are what
 * makes reuse detection possible, since a replayed token can only be
 * recognised as reuse while its row still exists. Seven days is well beyond
 * any plausible replay yet far short of the 90-day token lifetime, which keeps
 * table growth bounded. Deliberately a constant rather than an env var — the
 * env surface for ADR-0023 is three variables and this is not an operational
 * knob.
 */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Delete refresh-token rows that can no longer affect any decision: consumed
 * rows past the retention window, and rows whose own expiry is that far in the
 * past.
 */
export const pruneExpiredRefreshTokens = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - RETENTION_MS);

  const result = await AppDataSource.getRepository(RefreshToken)
    .createQueryBuilder()
    .delete()
    .from(RefreshToken)
    .where('rotated_at IS NOT NULL AND rotated_at < :cutoff', { cutoff })
    .orWhere('expires_at < :cutoff', { cutoff })
    .execute();

  return result.affected ?? 0;
};
