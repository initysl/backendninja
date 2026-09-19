import { Router } from 'express';

export const healthRouter: Router = Router();

// Outside /v1 on purpose: this is for load balancers, not API clients, so it
// must not move when the API is versioned.
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
