import express, { type Express } from 'express';
import { errorHandler } from './middleware/error-handler.ts';
import { httpLogger } from './middleware/http-logger.ts';
import { notFound } from './middleware/not-found.ts';
import { apiRouter } from './routes/index.ts';
import { healthRouter } from './routes/health.routes.ts';

export function createApp(): Express {
  const app = express();

  // First, so even a body-parser failure below has a request id and a logger.
  app.use(httpLogger);

  // Always set an explicit limit; an unbounded body is a free denial of service.
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use('/v1', apiRouter);

  // notFound turns unmatched routes into an error; errorHandler must be last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
