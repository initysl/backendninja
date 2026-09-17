import { z } from 'zod';

// Schemas are the single source of truth.

const urlSchema = z
  .url()
  .max(2048)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Must be an http or https URL.' },
  );

// The stored shape.
export const bookmarkSchema = z.object({
  id: z.uuid(),
  url: urlSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable(),
  tags: z.array(z.string().min(1).max(30)).max(20),
  favorite: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Bookmark = z.infer<typeof bookmarkSchema>;

// What a client may send.
export const createBookmarkSchema = z.strictObject({
  url: urlSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  favorite: z.boolean().optional(),
});

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

// PUT replaces the whole resource, so it takes the same shape as create.
export const replaceBookmarkSchema = createBookmarkSchema;

// PATCH is partial, and must reject an empty body or "update nothing" succeeds silently.
export const patchBookmarkSchema = createBookmarkSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type PatchBookmarkInput = z.infer<typeof patchBookmarkSchema>;

export const bookmarkParamsSchema = z.object({
  id: z.uuid({ message: 'Must be a UUID.' }),
});

export const sortOptions = [
  'createdAt',
  '-createdAt',
  'updatedAt',
  '-updatedAt',
  'title',
  '-title',
] as const;

// Query params arrive as strings, so they are coerced here - and the defaults
// live here too, so there is one answer to "what is the page size?".
export const listBookmarksQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(sortOptions).default('-createdAt'),
  q: z.string().trim().min(1).max(200).optional(),
  tag: z.string().trim().min(1).max(30).optional(),
  favorite: z.stringbool().optional(),
});

export type ListBookmarksQuery = z.infer<typeof listBookmarksQuerySchema>;

// Columns the importer reads. Extra columns in the file are ignored.
export const csvColumns = [
  'url',
  'title',
  'description',
  'tags',
  'favorite',
] as const;

const TRUE_VALUES = ['true', '1', 'yes', 'y'];
const FALSE_VALUES = ['false', '0', 'no', 'n'];

// A CSV row converted into the exact input the JSON endpoint accepts, then
// piped through createBookmarkSchema - one set of rules, two doors.
export const csvRowSchema = z
  .object({
    url: z.string(),
    title: z.string(),
    description: z.string().optional(),
    tags: z.string().optional(),
    favorite: z.string().optional(),
  })
  .transform((row, ctx) => {
    const rawFavorite = row.favorite?.trim().toLowerCase() ?? '';

    let favorite: boolean | undefined;
    if (rawFavorite === '') favorite = undefined;
    else if (TRUE_VALUES.includes(rawFavorite)) favorite = true;
    else if (FALSE_VALUES.includes(rawFavorite)) favorite = false;
    else {
      ctx.addIssue({
        code: 'custom',
        path: ['favorite'],
        message: `Must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}, or blank.`,
      });
      return z.NEVER;
    }

    const description = row.description?.trim();
    const tags = row.tags?.trim();

    return {
      url: row.url.trim(),
      title: row.title.trim(),
      ...(description ? { description } : {}),
      ...(tags
        ? {
            tags: tags
              .split(';')
              .map((tag) => tag.trim())
              .filter(Boolean),
          }
        : {}),
      ...(favorite === undefined ? {} : { favorite }),
    };
  })
  .pipe(createBookmarkSchema);
