import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { env } from '../config/env.ts';
import { payloadTooLargeError, unprocessableError } from '../errors/api-errors.ts';
import { csvRowSchema, type CreateBookmarkInput } from '../models/bookmark.model.ts';
import * as bookmarks from '../repositories/bookmark.repository.ts';
import * as reports from '../repositories/import-report.repository.ts';

const BATCH_SIZE = 500;

const REPORT_COLUMNS = ['line', 'url', 'title', 'field', 'code', 'message'] as const;

export type ImportSummary = {
  importId: string;
  totalRows: number;
  imported: number;
  failed: number;
  errorReportUrl: string | null;
};

// `write` returning false means the buffer is full. Ignoring it is the classic
// streaming bug: the loop keeps pushing and memory grows without bound.
async function writeRow(stream: Writable, row: unknown[]): Promise<void> {
  if (!stream.write(row)) await once(stream, 'drain');
}

// csv-parse raises `CSV_`-prefixed codes for a ragged row or an oversized
// record. Left alone they surface as 500s, blaming us for the caller's file.
function asClientError(error: unknown): unknown {
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code;
    const lines = (error as Error & { lines?: number }).lines;

    if (typeof code === 'string' && code.startsWith('CSV_')) {
      const where = typeof lines === 'number' ? ` at line ${lines}` : '';
      return unprocessableError(
        `The CSV could not be parsed${where}: ${error.message}`,
        'invalid_csv',
      );
    }
  }

  return error;
}

// Memory stays proportional to the batch size, not the file size, so a file
// larger than available RAM imports without trouble.
export async function importBookmarksCsv(uploadPath: string): Promise<ImportSummary> {
  const importId = randomUUID();
  const reportPath = reports.pathFor(importId);

  const stringifier = stringify({ header: true, columns: [...REPORT_COLUMNS] });

  // Started, not awaited: the report is written while the source is still being
  // read. pipeline, not .pipe, so an error destroys both ends.
  const reportWritten = pipeline(stringifier, createWriteStream(reportPath));

  const parser = parse({
    columns: true,
    bom: true,
    trim: true,
    skip_empty_lines: true,
    // A ragged row is a file-level problem; failing beats silently padding it.
    relax_column_count: false,
    // A single huge line with no newline defeats a file-size limit on its own.
    max_record_size: env.IMPORT_MAX_RECORD_BYTES,
    info: true,
  });

  let totalRows = 0;
  let imported = 0;
  let failed = 0;
  let batch: CreateBookmarkInput[] = [];

  // Catches duplicates within the file, which storage cannot see until a flush.
  const seenUrls = new Set<string>();

  const flush = (): void => {
    if (batch.length === 0) return;
    imported += bookmarks.createMany(batch).length;
    batch = [];
  };

  try {
    await pipeline(
      createReadStream(uploadPath),
      parser,
      // `for await` will not pull the next record until this body finishes,
      // which propagates backpressure all the way back to the file read.
      async (records: AsyncIterable<{ record: Record<string, string>; info: { lines: number } }>) => {
        for await (const { record, info } of records) {
          totalRows += 1;

          if (totalRows === 1 && !('url' in record && 'title' in record)) {
            throw unprocessableError(
              'The CSV must have a header row containing at least "url" and "title".',
            );
          }

          if (totalRows > env.IMPORT_MAX_ROWS) {
            throw payloadTooLargeError(
              `This import exceeds the maximum of ${env.IMPORT_MAX_ROWS} rows.`,
            );
          }

          // The source line number, not the record index — the user opens this
          // file in a spreadsheet and goes to that line.
          const line = info.lines;
          const rawUrl = record.url ?? '';
          const rawTitle = record.title ?? '';

          const parsed = csvRowSchema.safeParse(record);

          if (!parsed.success) {
            failed += 1;
            for (const issue of parsed.error.issues) {
              await writeRow(stringifier, [
                line,
                rawUrl,
                rawTitle,
                issue.path.map(String).join('.') || '(row)',
                issue.code,
                issue.message,
              ]);
            }
            continue;
          }

          const input = parsed.data;
          const key = bookmarks.normalizeUrl(input.url);

          if (seenUrls.has(key) || bookmarks.findByUrl(input.url)) {
            failed += 1;
            await writeRow(stringifier, [
              line,
              input.url,
              input.title,
              'url',
              'duplicate_url',
              'A bookmark with this URL already exists.',
            ]);
            continue;
          }

          seenUrls.add(key);
          batch.push(input);

          if (batch.length >= BATCH_SIZE) flush();
        }

        flush();
      },
    );

    stringifier.end();
    await reportWritten;
  } catch (error) {
    // Tear down the report side too, or its descriptor outlives the request.
    stringifier.destroy();
    await reportWritten.catch(() => undefined);
    await rm(reportPath, { force: true });
    throw asClientError(error);
  } finally {
    // The temp upload is deleted on every path. Forgetting this fills a disk.
    await rm(uploadPath, { force: true });
  }

  if (failed === 0) {
    await rm(reportPath, { force: true });
    return { importId, totalRows, imported, failed, errorReportUrl: null };
  }

  reports.save({
    id: importId,
    path: reportPath,
    filename: `import-errors-${importId}.csv`,
    rowCount: failed,
  });

  return {
    importId,
    totalRows,
    imported,
    failed,
    errorReportUrl: `/v1/imports/${importId}/errors.csv`,
  };
}
