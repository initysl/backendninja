import { Router } from 'express';
import * as controller from '../controllers/bookmarks.controller.ts';
import { validate } from '../middleware/validate.ts';
import {
  bookmarkParamsSchema,
  createBookmarkSchema,
  listBookmarksQuerySchema,
  patchBookmarkSchema,
  replaceBookmarkSchema,
} from '../models/bookmark.model.ts';

// Paths, methods and the middleware guarding them
export const bookmarksRouter: Router = Router();

bookmarksRouter.get(
  '/',
  validate({ query: listBookmarksQuerySchema }),
  controller.listBookmarks,
);

bookmarksRouter.post(
  '/',
  validate({ body: createBookmarkSchema }),
  controller.createBookmark,
);

bookmarksRouter.get(
  '/:id',
  validate({ params: bookmarkParamsSchema }),
  controller.getBookmark,
);

bookmarksRouter.put(
  '/:id',
  validate({ params: bookmarkParamsSchema, body: replaceBookmarkSchema }),
  controller.replaceBookmark,
);

bookmarksRouter.patch(
  '/:id',
  validate({ params: bookmarkParamsSchema, body: patchBookmarkSchema }),
  controller.patchBookmark,
);

bookmarksRouter.delete(
  '/:id',
  validate({ params: bookmarkParamsSchema }),
  controller.deleteBookmark,
);
