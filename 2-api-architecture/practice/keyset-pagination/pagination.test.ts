import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { keysetPage } from './keyset.ts';
import { offsetPage } from './offset.ts';
import { allSorted, currentIds, insert, remove, reset, type Story } from './store.ts';

const LIMIT = 20;
const MAX_PAGES = 200; // a broken paginator must fail, not hang

/** Drain every page, running `between` after each fetch so the data moves. */
function drainOffset(between: () => void): Story[] {
  const collected: Story[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = offsetPage(page, LIMIT);
    collected.push(...result.items);
    if (!result.hasMore) return collected;
    between();
  }
  throw new Error('offset pagination did not terminate');
}

function drainKeyset(between: () => void): Story[] {
  const collected: Story[] = [];
  let cursor: string | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = keysetPage(cursor, LIMIT);
    collected.push(...result.items);
    if (!result.nextCursor) return collected;
    between();
    cursor = result.nextCursor;
  }
  throw new Error('keyset pagination did not terminate');
}

function duplicatesIn(items: Story[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) duplicates.push(item.id);
    seen.add(item.id);
  }
  return duplicates;
}

function missingFrom(items: Story[], expected: Set<string>): string[] {
  const returned = new Set(items.map((item) => item.id));
  return [...expected].filter((id) => !returned.has(id));
}

/** A new story arrives at the top — the case that breaks offset pagination. */
const postStory = () => void insert('a story posted mid-scroll');

/** A story is removed from the top — the other case that breaks it. */
const removeNewest = () => {
  const newest = allSorted()[0];
  if (newest) remove(newest.id);
};

describe('keyset pagination over real Hacker News stories', () => {
  beforeEach(reset);

  it('returns no story twice when stories are posted mid-iteration', () => {
    const before = currentIds();
    const collected = drainKeyset(postStory);

    assert.deepEqual(duplicatesIn(collected), []);
    assert.deepEqual(missingFrom(collected, before), []);
  });

  it('skips no surviving story when stories are removed mid-iteration', () => {
    const before = currentIds();
    const collected = drainKeyset(removeNewest);
    const after = currentIds();

    // Stories deleted mid-iteration may legitimately not appear. The property
    // is narrower than "everything shows up": nothing that survived is lost.
    const survived = new Set([...before].filter((id) => after.has(id)));

    assert.deepEqual(duplicatesIn(collected), []);
    assert.deepEqual(missingFrom(collected, survived), []);
  });

  it('returns every story exactly once when nothing changes', () => {
    const before = currentIds();
    const collected = drainKeyset(() => {});

    assert.equal(collected.length, before.size);
    assert.deepEqual(duplicatesIn(collected), []);
  });

  it('rejects a tampered cursor', () => {
    assert.throws(() => keysetPage('not-a-cursor', LIMIT), /Cursor is/);
  });
});

describe('offset pagination — the same tests, to show why keyset exists', () => {
  beforeEach(reset);

  it('returns stories twice when stories are posted mid-iteration', () => {
    const collected = drainOffset(postStory);

    // Asserting the bug rather than hiding it: every story posted above the
    // window pushes it back over a row already shown.
    assert.ok(duplicatesIn(collected).length > 0, 'expected offset to duplicate rows');
  });

  it('skips stories when stories are removed mid-iteration', () => {
    const before = currentIds();
    const collected = drainOffset(removeNewest);
    const after = currentIds();
    const survived = new Set([...before].filter((id) => after.has(id)));

    assert.ok(missingFrom(collected, survived).length > 0, 'expected offset to skip rows');
  });
});
