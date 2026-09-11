import { dispatchNotification } from './pushDispatch';

export type InvitationNotificationInput = {
  groupId: string;
  groupName: string;
  inviterName: string;
  inviteeUserId: string;
};

/**
 * Notifies a single invitee. Only call this when `inviteeId` resolved to a
 * real user — `invitationService.createInvitation` leaves it `null` when
 * the invitee has no account yet, and there is nothing to subscribe to in
 * that case.
 */
export const notifyGroupInvitation = async (
  input: InvitationNotificationInput,
): Promise<void> => {
  await dispatchNotification([input.inviteeUserId], 'invitation.created', {
    actorName: input.inviterName,
    groupName: input.groupName,
    url: `/groups/${input.groupId}`,
  });
};
