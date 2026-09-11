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
 */
export const upsertSubscription = async (
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<void> => {
  const repo = getRepository();
  const existing = await repo.findOne({ where: { endpoint } });
  if (existing) {
    existing.userId = userId;
    existing.p256dh = p256dh;
    existing.auth = auth;
    await repo.save(existing);
    return;
  }
  await repo.save(repo.create({ userId, endpoint, p256dh, auth }));
};

export const deleteByEndpoint = async (endpoint: string): Promise<void> => {
  await getRepository().delete({ endpoint });
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
