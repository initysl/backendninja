import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

// Hacker News via Algolia: no key, no auth, real timestamps, real ids.
const ENDPOINT =
  'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=200';

const hitSchema = z.object({
  objectID: z.string(),
  created_at: z.iso.datetime(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  points: z.number().nullable(),
});

const responseSchema = z.object({ hits: z.array(hitSchema) });

export const storySchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  points: z.number().int(),
  createdAt: z.iso.datetime(),
});

export type Story = z.infer<typeof storySchema>;

const response = await fetch(ENDPOINT);
if (!response.ok) {
  throw new Error(`Algolia returned ${response.status} ${response.statusText}`);
}

const { hits } = responseSchema.parse(await response.json());

// Stories without a title are deleted or flagged posts. Drop them rather than
// paginating over holes.
const stories: Story[] = hits
  .filter((hit) => hit.title !== null)
  .map((hit) => ({
    id: hit.objectID,
    title: hit.title as string,
    author: hit.author ?? 'unknown',
    points: hit.points ?? 0,
    createdAt: hit.created_at,
  }));

const target = new URL('./stories.json', import.meta.url);
await writeFile(target, JSON.stringify(stories, null, 2) + '\n');

const timestamps = stories.map((story) => story.createdAt);
const ties = timestamps.length - new Set(timestamps).size;

console.log(`wrote ${stories.length} stories to stories.json`);
console.log(`timestamps sharing a second with another story: ${ties}`);
