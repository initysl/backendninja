import { keysetPage } from './keyset.ts';
import { offsetPage } from './offset.ts';
import { allSorted, count, currentIds, insert, remove, reset, type Story } from './store.ts';

const LIMIT = 20;

type Drain = { returned: number; duplicated: number; skipped: number };

function analyse(collected: Story[], before: Set<string>, after: Set<string>): Drain {
  const seen = new Set<string>();
  let duplicated = 0;
  for (const story of collected) {
    if (seen.has(story.id)) duplicated += 1;
    seen.add(story.id);
  }
  const survived = [...before].filter((id) => after.has(id));
  return {
    returned: collected.length,
    duplicated,
    skipped: survived.filter((id) => !seen.has(id)).length,
  };
}

function runOffset(between: () => void): Drain {
  reset();
  const before = currentIds();
  const collected: Story[] = [];
  for (let page = 1; page <= 200; page += 1) {
    const result = offsetPage(page, LIMIT);
    collected.push(...result.items);
    if (!result.hasMore) break;
    between();
  }
  return analyse(collected, before, currentIds());
}

function runKeyset(between: () => void): Drain {
  reset();
  const before = currentIds();
  const collected: Story[] = [];
  let cursor: string | null = null;
  for (let page = 1; page <= 200; page += 1) {
    const result = keysetPage(cursor, LIMIT);
    collected.push(...result.items);
    if (!result.nextCursor) break;
    between();
    cursor = result.nextCursor;
  }
  return analyse(collected, before, currentIds());
}

const postStory = () => void insert('a story posted mid-scroll');
const removeNewest = () => {
  const newest = allSorted()[0];
  if (newest) remove(newest.id);
};

reset();
console.log(`${count()} real Hacker News stories, ${LIMIT} per page\n`);

const rows = [
  ['offset', 'stories posted', runOffset(postStory)],
  ['keyset', 'stories posted', runKeyset(postStory)],
  ['offset', 'stories removed', runOffset(removeNewest)],
  ['keyset', 'stories removed', runKeyset(removeNewest)],
] as const;

console.log('strategy  mutation          returned  duplicated  skipped');
for (const [strategy, mutation, result] of rows) {
  console.log(
    `${strategy.padEnd(9)} ${mutation.padEnd(17)} ${String(result.returned).padStart(8)}` +
      `${String(result.duplicated).padStart(12)}${String(result.skipped).padStart(9)}`,
  );
}

reset();
console.log('\nfirst page, for proof it is real data:');
for (const story of keysetPage(null, 3).items) {
  console.log(`  ${story.createdAt}  ${story.id}  ${story.title.slice(0, 52)}`);
}
