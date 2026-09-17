import createError, { type HttpError } from 'http-errors';

// `code` is machine-readable and stable - clients branch on it, never on `message`.
export type FieldIssue = {
  field: string;
  code: string;
  message: string;
};

// http-errors gives us status, statusCode and expose (true below 500).
export type ApiError = HttpError & {
  code?: string;
  issues?: FieldIssue[];
};

function make(
  status: number,
  code: string,
  message: string,
  issues?: FieldIssue[],
): ApiError {
  return createError(status, message, { code, issues }) as ApiError;
}

export const badRequestError = (
  message = 'The request could not be read.',
): ApiError => make(400, 'bad_request', message);

export const notFoundError = (
  message = 'The requested resource does not exist.',
): ApiError => make(404, 'not_found', message);

export const conflictError = (
  message = 'The request conflicts with the current state.',
): ApiError => make(409, 'conflict', message);

export const payloadTooLargeError = (
  message = 'The request body is too large.',
): ApiError => make(413, 'payload_too_large', message);

export const unsupportedMediaTypeError = (
  message = 'The request content type is not supported.',
): ApiError => make(415, 'unsupported_media_type', message);

// 400 means the request could not be read at all; 422 means it parsed and broke the rules.
export const validationError = (issues: FieldIssue[]): ApiError =>
  make(
    422,
    'validation_failed',
    `${issues.length} field${issues.length === 1 ? '' : 's'} failed validation.`,
    issues,
  );

// Also 422, for a rule no single field owns - a CSV with the wrong header, say.
export const unprocessableError = (
  message: string,
  code = 'unprocessable',
): ApiError => make(422, code, message);
