import { Router } from 'express';
import * as controller from '../controllers/imports.controller.ts';
import { importParamsSchema } from '../controllers/imports.controller.ts';
import { uploadCsv } from '../middleware/upload.ts';
import { validate } from '../middleware/validate.ts';

export const importsRouter: Router = Router();

// Upload runs before the controller, so an oversized or wrong-typed file is
// rejected before a single row is parsed.
importsRouter.post('/bookmarks', uploadCsv, controller.importBookmarks);

importsRouter.get(
  '/:id/errors.csv',
  validate({ params: importParamsSchema }),
  controller.downloadErrorReport,
);
