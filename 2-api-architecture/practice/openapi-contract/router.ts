import { Router, type RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { routes, type RouteDescriptor } from './descriptors.ts';

function validate(
  request: NonNullable<RouteDescriptor['request']>,
): RequestHandler {
  return (req, res, next) => {
    const issues: string[] = [];
    const validated: Record<string, unknown> = {};

    for (const key of ['params', 'query', 'body'] as const) {
      const schema: ZodType | undefined = request[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (result.success) validated[key] = result.data;
      else
        issues.push(
          ...result.error.issues.map(
            (issue) =>
              `${key}.${issue.path.join('.') || '(root)'}: ${issue.message}`,
          ),
        );
    }

    if (issues.length > 0) {
      res
        .status(422)
        .type('application/problem+json')
        .json({
          type: '/problems/validation_failed',
          title: 'Unprocessable Content',
          status: 422,
          detail: issues.join('; '),
        });
      return;
    }

    res.locals.validated = validated;
    next();
  };
}

export const apiRouter: Router = Router();

// The router is BUILT FROM the descriptors. A route that is not described does
// not exist - which is what makes drift structurally hard rather than merely detected.
for (const route of routes) {
  const middleware = route.request ? [validate(route.request)] : [];
  apiRouter[route.method](route.path, ...middleware, route.handler);
}
