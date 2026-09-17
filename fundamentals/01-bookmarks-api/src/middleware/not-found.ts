import type { NextFunction, Request, Response } from 'express';
import { notFoundError } from '../errors/api-errors.ts';

// Registered after all routes: turns an unknown path into our envelope rather
// than Express's default HTML page.
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(notFoundError(`No route matches ${req.method} ${req.originalUrl}.`));
}
