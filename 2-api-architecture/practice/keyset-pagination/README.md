## Exercise — Keyset pagination that never skips or repeats a row

> Implement keyset pagination that never skips or repeats a row, and write a
> test that inserts rows _during_ iteration to prove it. Offset pagination fails
> this test; that is the point.

### What it does

Paginates **200 real Hacker News stories** two ways — offset and keyset — while
the data changes underneath, and measures what each one gets wrong.

Pagination looks like slicing. It isn't: it's a concurrency problem.
`LIMIT/OFFSET` is correct only while nothing else is writing, and in production
nothing else ever isn't.

```
200 real Hacker News stories, 20 per page

strategy  mutation          returned  duplicated  skipped
offset    stories posted         210          10        0
keyset    stories posted         200           0        0
offset    stories removed        191           0        9
keyset    stories removed        200           0        0
```

200 rows in, 210 out. That is the bug, counted.

### Why offset breaks

Page size 3, newest first, rows `F E D C B A`.

```
page 1 = OFFSET 0 LIMIT 3  →  F E D
```

Someone posts `G`. The rows become `G F E D C B A`.

```
page 2 = OFFSET 3 LIMIT 3  →  D C B        ← D again
```

Now the other direction. Back to `F E D C B A` with page 1 showing `F E D`,
someone deletes `E`, leaving `F D C B A`.

```
page 2 = OFFSET 3 LIMIT 3  →  B A          ← C never appears, on any page
```

**Rows added above you cause duplicates; rows removed above you cause skips.**
OFFSET counts positions, and positions move.

Keyset stops asking "skip 20" and asks "give me the rows after this specific
row". A cursor names a position in the data, so inserts and deletes elsewhere
cannot shift it. It is also far faster at depth — `OFFSET 100000` makes the
database walk and discard a hundred thousand rows; keyset seeks straight to the
boundary on an index.

### Running it

From the repository root:

```bash
npm run pagination:demo  -w api-architecture-practice   # the table above
npm run pagination:test  -w api-architecture-practice   # 6 tests
npm run pagination:fetch -w api-architecture-practice   # refresh stories.json
npm run typecheck        -w api-architecture-practice
```

`stories.json` is committed, so the tests are offline and deterministic. Only
`pagination:fetch` touches the network — a test that calls a live API is a test
that fails on a train.

### Layout

```
keyset-pagination/
├── fetch-stories.ts    one-off: 200 stories from Algolia → stories.json
├── stories.json        committed fixture, real data
├── store.ts            mutable in-memory store, sorted newest first
├── cursor.ts           opaque cursor: encode, decode, validate
├── offset.ts           the naive version
├── keyset.ts           the correct version
├── demo.ts             runs both under mutation and counts the damage
└── pagination.test.ts  the proof
```

### The test that proves it

Both strategies are drained page by page while a callback mutates the data
between fetches. Two properties are asserted:

- no id appears twice in the collected output
- every id that existed **when iteration started and still exists at the end**
  appears exactly once

That second property is narrower than "everything shows up", deliberately. A
story posted mid-iteration may or may not appear depending on where it sorts —
that is unavoidable and fine. What must never happen is losing or duplicating a
row that was there the whole time.

The offset tests **assert the bug** rather than hiding it. That makes the pair a
demonstration instead of a claim.

### What it demonstrates

**The tuple comparison is the whole trick.** `createdAt < cursor.createdAt`
alone loses every row sharing that timestamp, and timestamps tie constantly —
this fixture has a tie in 200 rows pulled from a single hour.
`createdAt <= cursor.createdAt && id < cursor.id` is a different and also wrong
condition. It has to be lexicographic over `(createdAt, id)`, which is exactly
what SQL's row-value syntax `(a, b) < (x, y)` gives you for free.

**Real data brought a real edge case.** Hacker News `objectID`s are numeric
strings. Comparing them as strings is only _accidentally_ correct while every id
has the same digit count — `"9"` sorts after `"10"` lexicographically. Every id
in this fixture happens to be eight digits, so a string comparison passes every
test here and would break the first time an id rolled over to nine. The
comparator converts to numbers on purpose.

**Opaque is not the same as trusted.** The cursor is base64url so clients cannot
hand-craft one and so its internal shape can change without breaking callers.
It is still untrusted input arriving in a query string: decode, then validate.

**The cursor carries its own sort.** A cursor built under `createdAt:desc` means
nothing under a different ordering. Encoding the sort makes that a rejected
cursor instead of quietly wrong results.

**`limit + 1` beats `COUNT(*)`.** Fetch one more row than asked; if it comes
back there is another page. No second query, and no count that is already stale
by the time it returns.

**Stability is not isolation.** Keyset guarantees no pre-existing row is skipped
or repeated. It does **not** give a consistent snapshot — you are reading moving
data in a stable order. A true point-in-time view needs a repeatable-read
transaction or an explicit `WHERE created_at <= :startedAt`. Worth knowing
before claiming more than it delivers.

### Finishing it

- Delete the id comparison from `isAfter` and re-run. With the tie in the
  fixture, rows start vanishing — which is the tuple lesson, felt rather than
  read.
- Add backward pagination. It means flipping the comparison **and** re-reversing
  the result set, and it is easy to get subtly wrong.
- Swap the cursor to an id-only comparison. Hacker News ids are monotonic, so
  the tuple collapses to one column — the same argument for UUID v7 when you
  control id generation yourself.
