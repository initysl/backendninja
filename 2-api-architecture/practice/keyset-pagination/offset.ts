import { allSorted, type Story } from './store.ts';

export type OffsetPage = { items: Story[]; page: number; hasMore: boolean };

// The naive version. Correct only while nothing else is writing to the table —
// which is never true once the service has users.
export function offsetPage(page: number, limit: number): OffsetPage {
  const sorted = allSorted();
  const start = (page - 1) * limit; // OFFSET: a count of rows to skip, not a position
  const items = sorted.slice(start, start + limit);

  return { items, page, hasMore: start + items.length < sorted.length };
}
