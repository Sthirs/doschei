import { Router } from 'express';

import { acceptInvitation, cancelInvitation, createGroup, declineInvitation, getGroup, listGroups, updateGroup, addMember, removeMember, createExpense, updateExpense, deleteExpense, createSettlement, updateSettlement, deleteSettlement, exportExpenses, updateGroupImage } from '../controllers/groupController';
import { requireAuth } from '../middleware/auth';
import { uploadSingleImage } from '../middleware/upload';
import { requireUuidParams } from '../middleware/uuidParams';

export const groupRouter = Router();

// Every route below with a path id is authenticated first, then has its ids
// checked for UUID shape before any handler can hand them to Postgres.
const authed = [requireAuth, requireUuidParams];

groupRouter.get('/', requireAuth, listGroups);
groupRouter.get('/:id', ...authed, getGroup);
groupRouter.post('/', requireAuth, createGroup);
groupRouter.patch('/:id', ...authed, updateGroup);
groupRouter.post('/:id/image', ...authed, uploadSingleImage, updateGroupImage);
groupRouter.post('/:id/members', ...authed, addMember);
groupRouter.delete('/:id/members/:userId', ...authed, removeMember);
groupRouter.post('/:id/invitations/:invitationId/accept', ...authed, acceptInvitation);
groupRouter.post('/:id/invitations/:invitationId/decline', ...authed, declineInvitation);
groupRouter.delete('/:id/invitations/:invitationId', ...authed, cancelInvitation);
groupRouter.post('/:id/expenses', ...authed, createExpense);
groupRouter.patch('/:id/expenses/:expenseId', ...authed, updateExpense);
groupRouter.delete('/:id/expenses/:expenseId', ...authed, deleteExpense);
groupRouter.get('/:id/expenses/export', ...authed, exportExpenses);
groupRouter.post('/:id/settlements', ...authed, createSettlement);
groupRouter.patch('/:id/settlements/:settlementId', ...authed, updateSettlement);
groupRouter.delete('/:id/settlements/:settlementId', ...authed, deleteSettlement);
