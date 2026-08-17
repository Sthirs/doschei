import { Router } from 'express';

import { acceptInvitation, cancelInvitation, createGroup, declineInvitation, getGroup, listGroups, updateGroup, addMember, removeMember, createExpense, updateExpense, deleteExpense, createSettlement, updateSettlement, deleteSettlement, exportExpenses } from '../controllers/groupController';
import { requireAuth } from '../middleware/auth';

export const groupRouter = Router();

groupRouter.get('/', requireAuth, listGroups);
groupRouter.get('/:id', requireAuth, getGroup);
groupRouter.post('/', requireAuth, createGroup);
groupRouter.patch('/:id', requireAuth, updateGroup);
groupRouter.post('/:id/members', requireAuth, addMember);
groupRouter.delete('/:id/members/:userId', requireAuth, removeMember);
groupRouter.post('/:id/invitations/:invitationId/accept', requireAuth, acceptInvitation);
groupRouter.post('/:id/invitations/:invitationId/decline', requireAuth, declineInvitation);
groupRouter.delete('/:id/invitations/:invitationId', requireAuth, cancelInvitation);
groupRouter.post('/:id/expenses', requireAuth, createExpense);
groupRouter.patch('/:id/expenses/:expenseId', requireAuth, updateExpense);
groupRouter.delete('/:id/expenses/:expenseId', requireAuth, deleteExpense);
groupRouter.get('/:id/expenses/export', requireAuth, exportExpenses);
groupRouter.post('/:id/settlements', requireAuth, createSettlement);
groupRouter.patch('/:id/settlements/:settlementId', requireAuth, updateSettlement);
groupRouter.delete('/:id/settlements/:settlementId', requireAuth, deleteSettlement);
