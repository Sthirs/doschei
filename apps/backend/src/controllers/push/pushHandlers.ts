import { Response } from 'express';

import { env } from '../../config/env';
import { AuthedRequest, AuthenticatedRequest } from '../../middleware/auth';
import { validatePushEndpoint } from '../../services/push/endpointValidation';
import {
  deleteByEndpointForUser,
  upsertSubscription,
} from '../../services/push/pushSubscriptionStore';

export const getPublicKey = (
  _request: AuthenticatedRequest,
  response: Response,
): void => {
  if (!env.pushEnabled) {
    response.status(503).json({ message: 'Push notifications are disabled.' });
    return;
  }
  response.json({ publicKey: env.VAPID_PUBLIC_KEY });
};

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export const createSubscription = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const { endpoint, keys } = request.body as SubscriptionBody;

  // The stored endpoint is later dereferenced server-side, so it is validated
  // against the known push services rather than merely type-checked — see
  // `services/push/endpointValidation.ts`.
  const validation = validatePushEndpoint(
    endpoint,
    env.pushEndpointExtraHostSuffixes,
  );
  if (!validation.ok) {
    response.status(400).json({ message: validation.message });
    return;
  }
  if (typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
    response.status(400).json({ message: 'keys.p256dh and keys.auth are required.' });
    return;
  }

  try {
    await upsertSubscription(
      auth.userId,
      validation.endpoint,
      keys.p256dh,
      keys.auth,
    );
    response.status(201).json({});
  } catch (error: unknown) {
    response.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Unable to save push subscription.',
    });
  }
};

type DeleteSubscriptionBody = { endpoint?: unknown };

export const deleteSubscription = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const { endpoint } = request.body as DeleteSubscriptionBody;

  // Deliberately not allowlist-validated: deleting a row triggers no outbound
  // request, and a client must stay able to retire an endpoint that predates
  // the validation in `createSubscription`.
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    response.status(400).json({ message: 'endpoint is required.' });
    return;
  }

  await deleteByEndpointForUser(auth.userId, endpoint);
  response.status(204).send();
};
