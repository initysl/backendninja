import { randomUUID } from 'node:crypto';
import type {
  Bookmark,
  CreateBookmarkInput,
  ListBookmarksQuery,
  PatchBookmarkInput,
} from '../models/bookmark.model.ts';

const bookmarks = new Map<string, Bookmark>();

// Secondary index: without it the uniqueness check is a full scan on every
// write, which is the in-memory version of a missing database index.
const idsByUrl = new Map<string, string>();

// Protocol and host are case-insensitive, the path is not. `URL` handles both.
export function normalizeUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url.trim();
  }
}

function toBookmark(input: CreateBookmarkInput, now: string): Bookmark {
  return {
    id: randomUUID(),
    url: input.url,
    title: input.title,
    description: input.description ?? null,
    tags: input.tags ?? [],
    favorite: input.favorite ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

function index(bookmark: Bookmark): void {
  bookmarks.set(bookmark.id, bookmark);
  idsByUrl.set(normalizeUrl(bookmark.url), bookmark.id);
}

export function reset(): void {
  bookmarks.clear();
  idsByUrl.clear();
}

export function count(): number {
  return bookmarks.size;
}

export function findById(id: string): Bookmark | undefined {
  return bookmarks.get(id);
}

export function findByUrl(url: string): Bookmark | undefined {
  const id = idsByUrl.get(normalizeUrl(url));
  return id ? bookmarks.get(id) : undefined;
}

export function create(input: CreateBookmarkInput): Bookmark {
  const bookmark = toBookmark(input, new Date().toISOString());
  index(bookmark);
  return bookmark;
}

// Against a Map this is just a loop. It exists because against Postgres it will
// not be: one statement for 500 rows instead of 500 round trips.
export function createMany(inputs: CreateBookmarkInput[]): Bookmark[] {
  const now = new Date().toISOString();
  return inputs.map((input) => {
    const bookmark = toBookmark(input, now);
    index(bookmark);
    return bookmark;
  });
}

export function replace(
  id: string,
  input: CreateBookmarkInput,
): Bookmark | undefined {
  const existing = bookmarks.get(id);
  if (!existing) return undefined;

  idsByUrl.delete(normalizeUrl(existing.url));

  const replaced: Bookmark = {
    id: existing.id,
    url: input.url,
    title: input.title,
    description: input.description ?? null,
    tags: input.tags ?? [],
    favorite: input.favorite ?? false,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  index(replaced);
  return replaced;
}

export function patch(
  id: string,
  input: PatchBookmarkInput,
): Bookmark | undefined {
  const existing = bookmarks.get(id);
  if (!existing) return undefined;

  if (input.url !== undefined) idsByUrl.delete(normalizeUrl(existing.url));

  const patched: Bookmark = {
    ...existing,
    ...(input.url !== undefined ? { url: input.url } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.favorite !== undefined ? { favorite: input.favorite } : {}),
    updatedAt: new Date().toISOString(),
  };

  index(patched);
  return patched;
}

export function remove(id: string): boolean {
  const existing = bookmarks.get(id);
  if (!existing) return false;

  idsByUrl.delete(normalizeUrl(existing.url));
  bookmarks.delete(id);
  return true;
}

const comparators: Record<
  ListBookmarksQuery['sort'],
  (a: Bookmark, b: Bookmark) => number
> = {
  createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt),
  '-createdAt': (a, b) => b.createdAt.localeCompare(a.createdAt),
  updatedAt: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  '-updatedAt': (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  title: (a, b) => a.title.localeCompare(b.title),
  '-title': (a, b) => b.title.localeCompare(a.title),
};

export type ListResult = {
  items: Bookmark[];
  total: number;
};

export function list(query: ListBookmarksQuery): ListResult {
  const needle = query.q?.toLowerCase();

  let matched = [...bookmarks.values()].filter((bookmark) => {
    if (query.favorite !== undefined && bookmark.favorite !== query.favorite)
      return false;
    if (query.tag !== undefined && !bookmark.tags.includes(query.tag))
      return false;

    if (needle !== undefined) {
      const haystack = [
        bookmark.title,
        bookmark.description ?? '',
        bookmark.url,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });

  matched = matched.sort(comparators[query.sort]);

  // Offset pagination: fine at this size. Layer 3 moves to cursors, because
  // OFFSET makes the database walk and discard every row it skips.
  const start = (query.page - 1) * query.limit;

  return {
    items: matched.slice(start, start + query.limit),
    total: matched.length,
  };
}
