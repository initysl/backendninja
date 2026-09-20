import { z } from 'zod';

const cursorPayloadSchema = z.object({
  createdAt: z.iso.datetime(),
  // A Hacker News objectID: a numeric string.
  id: z.string().regex(/^\d+$/),
  // Pins the ordering into the cursor. A cursor built under one sort means
  // nothing under another, and this turns that into a loud failure.
  sort: z.literal('createdAt:desc'),
});

export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// A cursor arrives in a query string, so anyone can edit it. Opaque is not the
// same as trusted: decode, then validate.
export function decodeCursor(raw: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Cursor is not valid base64url JSON.');
  }

  const result = cursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Cursor is malformed: ${result.error.issues
        .map((issue) => issue.path.join('.') || '(root)')
        .join(', ')}`,
    );
  }
  return result.data;
}
