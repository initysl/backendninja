import { rm } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../config/env.ts';
import { logger } from '../utils/logger.ts';

export const reportDir = join(tmpdir(), 'bookmarks-api-reports');
mkdirSync(reportDir, { recursive: true });

export type ImportReport = {
  id: string;
  path: string;
  filename: string;
  rowCount: number;
  createdAt: string;
  expiresAtMs: number;
};

const reports = new Map<string, ImportReport>();

export function pathFor(id: string): string {
  return join(reportDir, `${id}.csv`);
}

export function save(report: Omit<ImportReport, 'expiresAtMs' | 'createdAt'>): ImportReport {
  const stored: ImportReport = {
    ...report,
    createdAt: new Date().toISOString(),
    expiresAtMs: Date.now() + env.IMPORT_REPORT_TTL_SECONDS * 1000,
  };

  reports.set(stored.id, stored);
  return stored;
}

export function find(id: string): ImportReport | undefined {
  const report = reports.get(id);
  if (!report) return undefined;

  // Expired counts as gone even before the sweeper runs, so the TTL is exact.
  if (report.expiresAtMs <= Date.now()) {
    void discard(report);
    return undefined;
  }

  return report;
}

export function reset(): void {
  reports.clear();
}

async function discard(report: ImportReport): Promise<void> {
  reports.delete(report.id);
  await rm(report.path, { force: true }).catch((error: unknown) => {
    logger.warn({ err: error, reportId: report.id }, 'could not delete expired import report');
  });
}

// Without this the feature is a disk leak with a REST interface. `unref` keeps
// the timer from holding the event loop open so the process can still exit.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const report of reports.values()) {
    if (report.expiresAtMs <= now) void discard(report);
  }
}, 60_000);

sweeper.unref();
