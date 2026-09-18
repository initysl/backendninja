import { Router } from 'express';
import { bookmarksRouter } from './bookmarks.routes.ts';
import { importsRouter } from './imports.routes.ts';

// Mounted under /v1 by app.ts. One place for the prefix, so a future /v2 is a
// routing change rather than a find-and-replace across every router.
export const apiRouter: Router = Router();

apiRouter.use('/bookmarks', bookmarksRouter);
apiRouter.use('/imports', importsRouter);
