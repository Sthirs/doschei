import { NextFunction, Request, Response } from 'express';

// Every entity id is a Postgres `uuid` column. A path id that is not a UUID
// can never name an existing row, but handing it to TypeORM makes Postgres
// raise `invalid input syntax for type uuid`, which surfaced as a 500 HTML
// page or as a 400 echoing the raw database error. Rejecting it up front as
// a 404 matches how an unknown-but-well-formed id is already answered.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND_MESSAGES: Record<string, string> = {
  id: 'Group not found.',
  expenseId: 'Expense not found.',
  settlementId: 'Settlement not found.',
  invitationId: 'Invitation not found.',
  userId: 'User is not a member of this group.',
};

/**
 * Mount after `requireAuth`, so an unauthenticated caller still gets a 401
 * rather than learning anything from the id's shape.
 */
export const requireUuidParams = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  for (const [name, value] of Object.entries(request.params)) {
    if (typeof value === 'string' && !UUID_PATTERN.test(value)) {
      response
        .status(404)
        .json({ message: NOT_FOUND_MESSAGES[name] ?? 'Not found.' });
      return;
    }
  }

  next();
};
