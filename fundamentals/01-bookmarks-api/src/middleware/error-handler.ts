import type { NextFunction, Request, Response } from 'express';
import { isHttpError } from 'http-errors';
import { isProduction } from '../config/env.ts';
import type { FieldIssue } from '../errors/api-errors.ts';

// RFC 9457 problem details. Every failure returns this shape, so a client
// writes one parser. `type` and `title` are stable; `detail` describes this one.
type ProblemDocument = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  errors?: FieldIssue[];
  stack?: string;
};

// A read-only description, not the error itself: writing fields onto an error
// thrown by a dependency is how you end up debugging a frozen object.
type ErrorDescriptor = {
  status: number;
  code: string;
  expose: boolean;
  message: string;
  issues?: FieldIssue[];
  headers?: Record<string, string>;
  stack?: string;
};

const titles: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

const codesByStatus: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'validation_failed',
  429: 'too_many_requests',
};

// express.json() throws http-errors carrying a `type`; mapping it keeps a
// body-parser implementation detail from leaking to clients.
const codesByParserType: Record<string, string> = {
  'entity.parse.failed': 'malformed_json',
  'entity.too.large': 'payload_too_large',
  'encoding.unsupported': 'unsupported_media_type',
  'request.aborted': 'request_aborted',
};

const multerCodes: Record<string, { status: number; code: string }> = {
  LIMIT_FILE_SIZE: { status: 413, code: 'payload_too_large' },
  LIMIT_FILE_COUNT: { status: 400, code: 'too_many_files' },
  LIMIT_UNEXPECTED_FILE: { status: 400, code: 'unexpected_file_field' },
};

function describe(error: unknown): ErrorDescriptor {
  // Covers our errors and everything Express throws: both are http-errors.
  if (isHttpError(error)) {
    const extra = error as typeof error & {
      type?: string;
      code?: string;
      issues?: FieldIssue[];
    };

    return {
      status: error.status,
      code:
        extra.code ??
        (extra.type ? codesByParserType[extra.type] : undefined) ??
        codesByStatus[error.status] ??
        'http_error',
      expose: error.expose,
      message: error.message,
      issues: extra.issues,
      // Some statuses are incomplete without these: 405 needs Allow, 401 needs WWW-Authenticate.
      headers: error.headers as Record<string, string> | undefined,
      stack: error.stack,
    };
  }

  // Multer is not an http-errors user, so it needs translating by hand.
  if (error instanceof Error && error.name === 'MulterError') {
    const multerCode = (error as Error & { code?: string }).code ?? '';
    const mapped = multerCodes[multerCode] ?? { status: 400, code: 'bad_upload' };

    return {
      status: mapped.status,
      code: mapped.code,
      expose: true,
      message: error.message,
      stack: error.stack,
    };
  }

  // Anything left is a bug: expose stays false so the real message only reaches the logs.
  return {
    status: 500,
    code: 'internal_error',
    expose: false,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

// The only place an error becomes a response. Registered last, and all four
// parameters are required — Express recognises error middleware by arity.
// Kept synchronous: an error thrown in here escapes to Express's final handler.
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Already streaming, so Express destroys the socket — the only move left.
  if (res.headersSent) {
    next(error);
    return;
  }

  const described = describe(error);

  const problem: ProblemDocument = {
    type: `/problems/${described.code}`,
    title: titles[described.status] ?? 'Error',
    status: described.status,
    detail: described.expose
      ? described.message
      : 'An unexpected error occurred. Quote the requestId when reporting it.',
    instance: req.originalUrl,
    code: described.code,
    requestId: String(req.id),
  };

  if (described.expose && described.issues) problem.errors = described.issues;
  if (!described.expose && !isProduction) problem.stack = described.stack;

  // req.log is pino-http's child logger, so this already carries the request id.
  if (described.status >= 500) req.log.error({ err: error }, 'request failed');
  else req.log.warn({ err: error, code: described.code }, 'request rejected');

  if (described.headers) res.set(described.headers);

  // A proxy caching a 404 and replaying it is a painful bug to find.
  res.set('Cache-Control', 'no-store');

  res.status(described.status).type('application/problem+json').json(problem);
}
