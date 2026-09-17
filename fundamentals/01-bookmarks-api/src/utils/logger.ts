import { pino } from 'pino';
import { env } from '../config/env.ts';

const prettyInDevelopment =
  env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {};

export const logger = pino({
  // A request log per assertion buries the failure you are looking for.
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,

  // Secrets must never reach an aggregator.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.token',
    ],
    remove: true,
  },

  ...prettyInDevelopment,
});

export type Logger = typeof logger;
