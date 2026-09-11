import { In } from 'typeorm';

import { env } from '../../config/env';
import { AppDataSource } from '../../db/data-source';
import { User } from '../../entities/User';
import {
  renderNotification,
  type NotificationKind,
  type NotificationParams,
} from './notificationMessages';
import { deleteByEndpoint, listByUserIds } from './pushSubscriptionStore';
import { sendToSubscription } from './webPushClient';

/**
 * Fans one notification out to every push subscription of the given users,
 * rendering it once per distinct recipient language. Best-effort and
 * side-effect-only: every failure is swallowed here so a notification can
 * never fail or delay the ledger write that triggered it
 * (docs/specifications.md §Product Decisions).
 */
export const dispatchNotification = async (
  userIds: string[],
  kind: NotificationKind,
  params: NotificationParams,
): Promise<void> => {
  if (!env.pushEnabled || userIds.length === 0) return;

  try {
    const [users, subscriptions] = await Promise.all([
      AppDataSource.getRepository(User).findBy({ id: In(userIds) }),
      listByUserIds(userIds),
    ]);

    if (subscriptions.length === 0) return;

    const languageByUserId = new Map(users.map((user) => [user.id, user.language]));
    const payloadByLanguage = new Map<string, string>();

    const payloadFor = (language: string): string => {
      const cached = payloadByLanguage.get(language);
      if (cached) return cached;
      const { title, body } = renderNotification(kind, language, params);
      const payload = JSON.stringify({ title, body, url: params.url });
      payloadByLanguage.set(language, payload);
      return payload;
    };

    await Promise.all(
      subscriptions.map(async (subscription) => {
        const language = languageByUserId.get(subscription.userId) ?? 'en';
        const result = await sendToSubscription(
          subscription,
          payloadFor(language),
        );
        if (result === 'gone') {
          await deleteByEndpoint(subscription.endpoint);
        }
      }),
    );
  } catch {
    // Best-effort by design — see the function doc comment above.
  }
};
