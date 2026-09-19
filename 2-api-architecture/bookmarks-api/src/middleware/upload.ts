import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import multer from 'multer';
import { env } from '../config/env.ts';
import { unsupportedMediaTypeError } from '../errors/api-errors.ts';

export const uploadDir = join(tmpdir(), 'bookmarks-api-uploads');
mkdirSync(uploadDir, { recursive: true });

// Browsers and spreadsheet tools disagree about what a CSV is called.
const acceptedMimeTypes = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

export const uploadCsv = multer({
  // Disk, not memory: memoryStorage would buffer the whole upload into RAM and
  // defeat the streaming parse. The cost is a temp file to delete in a finally.
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.csv`),
  }),

  // The upload is untrusted input; every one of these limits is load-bearing.
  limits: {
    fileSize: env.IMPORT_MAX_FILE_BYTES,
    files: 1,
    fields: 5,
  },

  fileFilter: (_req, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      callback(unsupportedMediaTypeError(`Expected a CSV upload, received ${file.mimetype}.`));
      return;
    }
    callback(null, true);
  },
}).single('file');
