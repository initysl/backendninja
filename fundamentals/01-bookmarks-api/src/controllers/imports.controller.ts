import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { badRequestError, notFoundError } from '../errors/api-errors.ts';
import { validParams } from '../middleware/validate.ts';
import * as reports from '../repositories/import-report.repository.ts';
import * as service from '../services/import.service.ts';

export const importParamsSchema = z.object({
  id: z.uuid({ message: 'Must be a UUID.' }),
});

// Partial success is still a successful request, so 200 — not 207, which is
// WebDAV multi-status and the usual mis-citation here. Becomes 202 plus a job
// id once this moves onto a queue in layer 5.
// No wrapper needed: Express 5 forwards a rejected promise to the error middleware.
export async function importBookmarks(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw badRequestError('Attach a CSV file in a multipart field named "file".');
  }

  const summary = await service.importBookmarksCsv(req.file.path);
  res.status(200).json(summary);
}

// A second endpoint because one response cannot be both a JSON summary and a
// CSV attachment. `res.download()` is the production shortcut; streaming is
// spelled out here because it shows the failure mode below.
export async function downloadErrorReport(req: Request, res: Response): Promise<void> {
  const { id } = validParams(res, importParamsSchema);

  const report = reports.find(id);
  if (!report) {
    throw notFoundError(`No error report with id ${id}. Reports expire after a while.`);
  }

  res.status(200);
  res.type('text/csv');
  // The header that makes a browser save the file instead of rendering it.
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  try {
    await pipeline(createReadStream(report.path), res);
  } catch (error) {
    req.log.error({ err: error, reportId: id }, 'error report download failed');
    // Once the first byte is out the status is already sent, so all that is
    // left is to destroy the response and signal an incomplete body.
    if (!res.headersSent) throw error;
    res.destroy();
  }
}
