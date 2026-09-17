import type { Request, Response } from 'express';
import { validBody, validParams, validQuery } from '../middleware/validate.ts';
import {
  bookmarkParamsSchema,
  createBookmarkSchema,
  listBookmarksQuerySchema,
  patchBookmarkSchema,
  replaceBookmarkSchema,
} from '../models/bookmark.model.ts';
import * as service from '../services/bookmark.service.ts';

// Request in, response out, one service call each.
// _req - unused parameter
export function listBookmarks(_req: Request, res: Response): void {
  const query = validQuery(res, listBookmarksQuerySchema);
  res.status(200).json(service.listBookmarks(query));
}

export function getBookmark(_req: Request, res: Response): void {
  const { id } = validParams(res, bookmarkParamsSchema);
  res.status(200).json(service.getBookmark(id));
}

export function createBookmark(_req: Request, res: Response): void {
  const input = validBody(res, createBookmarkSchema);
  const bookmark = service.createBookmark(input);

  // The body is a convenience; the Location header is the contract.
  res.status(201).location(`/v1/bookmarks/${bookmark.id}`).json(bookmark);
}

export function replaceBookmark(_req: Request, res: Response): void {
  const { id } = validParams(res, bookmarkParamsSchema);
  const input = validBody(res, replaceBookmarkSchema);
  res.status(200).json(service.replaceBookmark(id, input));
}

export function patchBookmark(_req: Request, res: Response): void {
  const { id } = validParams(res, bookmarkParamsSchema);
  const input = validBody(res, patchBookmarkSchema);
  res.status(200).json(service.patchBookmark(id, input));
}

export function deleteBookmark(_req: Request, res: Response): void {
  const { id } = validParams(res, bookmarkParamsSchema);
  service.deleteBookmark(id);

  // 204 means no body; sending one is a violation some clients enforce.
  res.status(204).end();
}
