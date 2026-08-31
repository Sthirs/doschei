import { Response } from 'express';

import { AuthedRequest, AuthenticatedRequest } from '../../middleware/auth';
import type { CsvExportStream } from '../../services/csvExport';
import { groupService } from './groupServiceInstance';

export const exportExpenses = async (
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> => {
  const { auth } = request as AuthedRequest;
  const groupId = request.params.id as string;
  const month = request.query.month;

  if (typeof month !== 'string' || !/^(\d{4})-(0[1-9]|1[0-2])$/.test(month)) {
    response
      .status(400)
      .json({ message: 'A "month" query parameter (YYYY-MM) is required.' });
    return;
  }

  let stream: CsvExportStream;
  try {
    stream = await groupService.startExpensesCsv(groupId, auth.userId, month);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Group not found')) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('Invalid month')) {
      response.status(400).json({ message: error.message });
      return;
    }
    response.status(500).json({ message: 'Unable to export expenses.' });
    return;
  }

  response.setHeader('Content-Type', stream.headers.contentType);
  response.setHeader('Cache-Control', stream.headers.cacheControl);
  response.setHeader('Content-Disposition', stream.headers.contentDisposition);
  response.flushHeaders();

  try {
    for await (const row of stream.rows) {
      response.write(row); // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write — CSV file download, fields pre-escaped via csvEscapeField; not HTML
    }
    response.end();
  } catch (error: unknown) {
    response.destroy(
      error instanceof Error ? error : new Error('Unable to export expenses.'),
    );
  }
};
