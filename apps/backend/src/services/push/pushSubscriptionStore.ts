import { In, type Repository } from 'typeorm';

import { AppDataSource } from '../../db/data-source';
import { PushSubscription } from '../../entities/PushSubscription';

let repository: Repository<PushSubscription> | undefined;

const getRepository = (): Repository<PushSubscription> => {
  if (!repository) {
    repository = AppDataSource.getRepository(PushSubscription);
  }
  return repository;
};

/**
 * Upserts by `endpoint` (the natural key — the browser reissues the same
 * endpoint on re-subscribe, including the boot-time re-subscribe that
 * absorbs ADR-0020's unregister-on-deploy behaviour).
 *
 * A single atomic `INSERT ... ON CONFLICT`, not a `findOne`-then-`save`
 * sequence: two concurrent registrations of a brand-new endpoint (e.g.
 * several tabs booting at once) would otherwise both pass the `findOne`
 * check and one would fail on the unique constraint, surfacing to a client
 * that did nothing wrong as a 400.
 */
export const upsertSubscription = async (
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> => {
  await getRepository().upsert(
    { userId, endpoint, p256dh, auth },
    { conflictPaths: ['endpoint'] },
  );
};

/**
 * Prunes the subscription a dispatch attempt found "gone" — scoped to the
 * exact `p256dh`/`auth` that attempt sent, not just `endpoint`, so a
 * subscription re-registered (same endpoint, new keys) between the failed
 * send and this cleanup isn't deleted out from under its new owner.
 */
export const deleteByEndpoint = async (
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> => {
  await getRepository().delete({ endpoint, p256dh, auth });
};

export const deleteByEndpointForUser = async (
  userId: string,
  endpoint: string,
): Promise<void> => {
  await getRepository().delete({ userId, endpoint });
};

export const listByUserIds = async (
  userIds: string[],
): Promise<PushSubscription[]> => {
  if (userIds.length === 0) return [];
  return getRepository().findBy({ userId: In(userIds) });
};
