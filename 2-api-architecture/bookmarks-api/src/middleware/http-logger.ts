import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.ts';

// Assigns a request id, attaches a child logger so downstream lines carry it
// without being passed around, and logs one line per completed request.
export const httpLogger = pinoHttp({
  // Not optional: without it pino-http builds its own logger and silently drops redaction.
  logger,

  // Honour an inbound id so a trace survives across services, and echo it back.
  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];
    const id =
      typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 200
        ? inbound
        : randomUUID();

    res.setHeader('X-Request-Id', id);
    return id;
  },

  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // Health checks run forever; logging them buries the lines that matter.
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});
