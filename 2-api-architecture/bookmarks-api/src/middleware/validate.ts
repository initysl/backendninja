import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodType } from 'zod';
import { validationError, type FieldIssue } from '../errors/api-errors.ts';

export type ValidationSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export type ValidatedData = {
  body: unknown;
  query: unknown;
  params: unknown;
};

function toFieldIssues(error: z.ZodError, source: string): FieldIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join('.');
    return {
      field: path ? `${source}.${path}` : source,
      code: issue.code,
      message: issue.message,
    };
  });
}

// The one boundary between untrusted input and the rest of the app: past here,
// data is parsed and typed, so services do no defensive checking.
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const issues: FieldIssue[] = [];
    const validated: ValidatedData = {
      body: undefined,
      query: undefined,
      params: undefined,
    };

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) validated.body = result.data;
      else issues.push(...toFieldIssues(result.error, 'body'));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) validated.query = result.data;
      else issues.push(...toFieldIssues(result.error, 'query'));
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) validated.params = result.data;
      else issues.push(...toFieldIssues(result.error, 'params'));
    }

    // All three are checked before throwing, so a client sees every problem at once.
    if (issues.length > 0) {
      next(validationError(issues));
      return;
    }

    res.locals.validated = validated;
    next();
  };
}

// Typed accessors, so controllers never write a raw cast. The middleware
// already parsed with this same schema; these restore the type it produced.
export function validBody<T extends ZodType>(res: Response, _schema: T): z.infer<T> {
  return res.locals.validated.body as z.infer<T>;
}

export function validQuery<T extends ZodType>(res: Response, _schema: T): z.infer<T> {
  return res.locals.validated.query as z.infer<T>;
}

export function validParams<T extends ZodType>(res: Response, _schema: T): z.infer<T> {
  return res.locals.validated.params as z.infer<T>;
}
