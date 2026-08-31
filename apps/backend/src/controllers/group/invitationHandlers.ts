import { Response } from 'express';

import { AuthenticatedRequest } from '../../middleware/auth';
import { invitationService } from '../../services/invitationService';

export const acceptInvitation = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const invitationId = request.params.invitationId as string;

  try {
    const invitation = await invitationService.acceptInvitation(
      invitationId,
      request.auth!.userId,
    );

    response.status(200).json({ invitation });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not the invitee')) {
      response.status(403).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to accept invitation.',
    });
  }
};

export const declineInvitation = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const invitationId = request.params.invitationId as string;

  try {
    const invitation = await invitationService.declineInvitation(
      invitationId,
      request.auth!.userId,
    );

    response.status(200).json({ invitation });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not the invitee')) {
      response.status(403).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : 'Unable to decline invitation.',
    });
  }
};

export const cancelInvitation = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const invitationId = request.params.invitationId as string;

  try {
    await invitationService.cancelInvitation(
      invitationId,
      request.auth!.userId,
    );

    response.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not the inviter')) {
      response.status(403).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to cancel invitation.',
    });
  }
};
