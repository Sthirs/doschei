import { Response } from 'express';

import { AuthenticatedRequest } from '../../middleware/auth';
import { groupService } from './groupServiceInstance';

type SettlementBody = {
  paidByUserId?: unknown;
  paidToUserId?: unknown;
  amount?: unknown;
  date?: unknown;
};

export const createSettlement = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const groupId = request.params.id as string;
  const { paidByUserId, paidToUserId, amount, date } =
    request.body as SettlementBody;

  try {
    const expense = await groupService.createSettlementForGroup(
      groupId,
      request.auth!.userId,
      {
        paidByUserId,
        paidToUserId,
        amount,
        date,
      },
    );

    response.status(201).json({ expense });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to create settlement.',
    });
  }
};

export const updateSettlement = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const groupId = request.params.id as string;
  const settlementId = request.params.settlementId as string;
  const { paidByUserId, paidToUserId, amount, date } =
    request.body as SettlementBody;

  try {
    const expense = await groupService.updateSettlementForGroup(
      groupId,
      settlementId,
      {
        paidByUserId,
        paidToUserId,
        amount,
        date,
      },
      request.auth!.userId,
    );

    response.status(200).json({ expense });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to update settlement.',
    });
  }
};

export const deleteSettlement = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const groupId = request.params.id as string;
  const settlementId = request.params.settlementId as string;

  try {
    await groupService.deleteSettlementForGroup(
      groupId,
      settlementId,
      request.auth!.userId,
    );

    response.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(400).json({
      message:
        error instanceof Error ? error.message : 'Unable to delete settlement.',
    });
  }
};
