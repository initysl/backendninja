// res.locals is where per-request data goes in Express 5 — req.query and
// req.params are getter-only. req.id and req.log come from pino-http's own types.

import type { ValidatedData } from '../middleware/validate.ts';

declare global {
  namespace Express {
    interface Locals {
      validated: ValidatedData;
    }
  }
}

export {};
