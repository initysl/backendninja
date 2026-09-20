import { createRequire } from 'node:module';
import type { Story } from './fetch-stories.ts';

const require = createRequire(import.meta.url);
const fixture = require('./stories.json') as Story[];

export type { Story };

const stories = new Map<string, Story>();

// Hacker News ids increase monotonically, so a "new" story is one with an id
// above every existing one. Mirrors how the real site behaves.
let nextId = 0;

export function reset(): void {
  stories.clear();
  for (const story of fixture) stories.set(story.id, { ...story });
  nextId = Math.max(...fixture.map((story) => Number(story.id)));
}

export function insert(title: string): Story {
  nextId += 1;
  const story: Story = {
    id: String(nextId),
    title,
    author: 'local',
    points: 0,
    createdAt: new Date().toISOString(),
  };
  stories.set(story.id, story);
  return story;
}

export function remove(id: string): boolean {
  return stories.delete(id);
}

export function currentIds(): Set<string> {
  return new Set(stories.keys());
}

export function count(): number {
  return stories.size;
}

// HN objectIDs are numeric strings. Comparing them as strings is only
// accidentally correct while every id has the same digit count — "9" sorts
// after "10" lexicographically. Every comparison here, and the cursor, has to
// agree on treating them as numbers.
export function compareIdDesc(a: string, b: string): number {
  return Number(b) - Number(a);
}

// The in-memory stand-in for: ORDER BY created_at DESC, id DESC
export function compareDesc(a: Story, b: Story): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return compareIdDesc(a.id, b.id);
}

export function allSorted(): Story[] {
  return [...stories.values()].sort(compareDesc);
}
