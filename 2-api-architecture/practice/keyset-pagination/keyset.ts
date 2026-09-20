import { decodeCursor, encodeCursor, type CursorPayload } from './cursor.ts';
import { allSorted, type Story } from './store.ts';

export type KeysetPage = { items: Story[]; nextCursor: string | null };

// "Strictly after this row" under createdAt DESC, id DESC.
//
// The tuple comparison is the whole trick:
//   story.createdAt < cursor.createdAt                     loses every tied row
//   story.createdAt <= cursor.createdAt && id < cursor.id  a different, wrong condition
// It has to be lexicographic over (createdAt, id) — exactly what SQL's
// row-value syntax `(a, b) < (x, y)` does for you.
function isAfter(story: Story, cursor: CursorPayload): boolean {
  if (story.createdAt !== cursor.createdAt) return story.createdAt < cursor.createdAt;
  return Number(story.id) < Number(cursor.id);
}

export function keysetPage(rawCursor: string | null, limit: number): KeysetPage {
  const sorted = allSorted();
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;

  // The WHERE clause: a position in the data, not a number of rows to skip.
  const candidates = cursor ? sorted.filter((story) => isAfter(story, cursor)) : sorted;

  // Fetch one more than asked. If it comes back there is another page —
  // cheaper and less racy than a separate COUNT(*).
  const window = candidates.slice(0, limit + 1);
  const items = window.slice(0, limit);
  const hasMore = window.length > limit;

  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id, sort: 'createdAt:desc' })
      : null;

  return { items, nextCursor };
}
