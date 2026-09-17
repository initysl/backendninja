import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { logger } from './utils/logger.ts';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server listening');
});

// How long to let in-flight requests finish before giving up on them.
const SHUTDOWN_GRACE_MS = 10_000;

let shuttingDown = false;

/**
 * Graceful shutdown.
 *
 * A container runtime sends SIGTERM and then kills the process a fixed time
 * later. Exiting immediately drops every request in flight; closing the server
 * first stops new connections while letting current ones finish. The timer is
 * the backstop for a request that never ends.
 */
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'shutdown started');

  const forceExit = setTimeout(() => {
    logger.error(
      { graceMs: SHUTDOWN_GRACE_MS },
      'shutdown timed out, forcing exit',
    );
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);

  // Do not hold the event loop open just for the timer.
  forceExit.unref();

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }

    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection or uncaught exception means the process is in an
// unknown state. Log it and let the supervisor restart you — a process that
// keeps serving after an unknown failure serves wrong answers.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'uncaught exception');
  shutdown('uncaughtException');
});
