import { conflictError, notFoundError } from '../errors/api-errors.ts';
import type {
  Bookmark,
  CreateBookmarkInput,
  ListBookmarksQuery,
  PatchBookmarkInput,
} from '../models/bookmark.model.ts';
import * as repository from '../repositories/bookmark.repository.ts';

// The rules. Nothing here imports Request or Response or picks a status code -
// it throws, and the HTTP layer translates. Callable from a CLI with no Express.

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type BookmarkList = {
  data: Bookmark[];
  pagination: Pagination;
};

export function listBookmarks(query: ListBookmarksQuery): BookmarkList {
  const { items, total } = repository.list(query);
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

  return {
    data: items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevious: query.page > 1 && total > 0,
    },
  };
}

export function getBookmark(id: string): Bookmark {
  const bookmark = repository.findById(id);
  if (!bookmark) throw notFoundError(`No bookmark with id ${id}.`);
  return bookmark;
}

export function createBookmark(input: CreateBookmarkInput): Bookmark {
  const existing = repository.findByUrl(input.url);
  if (existing) {
    throw conflictError(
      `A bookmark for ${input.url} already exists (id ${existing.id}).`,
    );
  }

  return repository.create(input);
}

// Deliberately not an upsert: PUT on a missing id is a 404.
export function replaceBookmark(
  id: string,
  input: CreateBookmarkInput,
): Bookmark {
  if (!repository.findById(id))
    throw notFoundError(`No bookmark with id ${id}.`);

  assertUrlAvailable(input.url, id);

  const replaced = repository.replace(id, input);
  if (!replaced) throw notFoundError(`No bookmark with id ${id}.`);
  return replaced;
}

export function patchBookmark(id: string, input: PatchBookmarkInput): Bookmark {
  if (!repository.findById(id))
    throw notFoundError(`No bookmark with id ${id}.`);

  if (input.url !== undefined) assertUrlAvailable(input.url, id);

  const patched = repository.patch(id, input);
  if (!patched) throw notFoundError(`No bookmark with id ${id}.`);
  return patched;
}

// 404 on a second delete: idempotency constrains the effect, not the status code.
export function deleteBookmark(id: string): void {
  if (!repository.remove(id)) throw notFoundError(`No bookmark with id ${id}.`);
}

// A URL may be taken, as long as it is taken by the record being written.
function assertUrlAvailable(url: string, selfId: string): void {
  const owner = repository.findByUrl(url);
  if (owner && owner.id !== selfId) {
    throw conflictError(
      `A bookmark for ${url} already exists (id ${owner.id}).`,
    );
  }
}
