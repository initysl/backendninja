# Bookmarks API

Layer 1 of the backend roadmap: full CRUD in bare Express 5, Zod validation, one
consistent error envelope, and a streaming CSV import that validates every row and
returns a downloadable error report.

Storage is an in-memory `Map`. It is replaced by Postgres and Prisma in layer 3, which
is why every query lives behind `repositories/`.

## Running it

```bash
cp .env.example .env          # optional, every value has a default
npm run dev  -w bookmarks-api # watch mode
npm start    -w bookmarks-api
npm test     -w bookmarks-api
npm run typecheck -w bookmarks-api
```

TypeScript runs directly through Node's native type stripping — there is no build step
and no `tsx`.

## Endpoints

| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/health` | 200 | Outside `/v1`: for load balancers, not clients |
| GET | `/v1/bookmarks` | 200 | `page`, `limit`, `sort`, `q`, `tag`, `favorite` |
| POST | `/v1/bookmarks` | 201 | Returns a `Location` header |
| GET | `/v1/bookmarks/:id` | 200 | |
| PUT | `/v1/bookmarks/:id` | 200 | Full replacement; omitted fields are reset |
| PATCH | `/v1/bookmarks/:id` | 200 | Partial; an empty body is a 422 |
| DELETE | `/v1/bookmarks/:id` | 204 | No body |
| POST | `/v1/imports/bookmarks` | 200 | `multipart/form-data`, field name `file` |
| GET | `/v1/imports/:id/errors.csv` | 200 | `text/csv` attachment |

### Status codes and why

- **An empty collection is 200, not 404.** The collection exists; it has no members.
- **201 carries `Location`.** The body is a convenience, the header is the contract.
- **400 vs 422.** 400 means the request could not be read at all — broken JSON, a body
  over the size limit. 422 means it parsed fine and broke the rules. One rule, held
  everywhere.
- **409** when a URL already belongs to another bookmark.
- **DELETE twice returns 404.** Idempotency constrains the effect, not the status code,
  so this is standards-compliant — but it is a choice, and this is where it is written
  down.
- **Unknown keys are rejected**, in bodies and in query strings. A typo'd `titel` or
  `limitt` fails loudly instead of being silently ignored.

### The error envelope

Every failure — 404, 422, 500 alike — returns [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)
problem details as `application/problem+json`, so a client writes one parser:

```json
{
  "type": "/problems/validation_failed",
  "title": "Unprocessable Content",
  "status": 422,
  "detail": "2 fields failed validation.",
  "instance": "/v1/bookmarks",
  "code": "validation_failed",
  "requestId": "5c018314-a357-4d86-a74c-e10d86290bad",
  "errors": [
    { "field": "body.url", "code": "invalid_format", "message": "Invalid URL" }
  ]
}
```

Branch on `code`, never on `detail`. Errors below 500 explain themselves; a 500 returns a
generic message and the real cause goes to the logs under the same `requestId`, which is
also returned in the `X-Request-Id` header.

## The CSV import

Columns: `url`, `title`, `description`, `tags` (semicolon-separated), `favorite`. Only
`url` and `title` are required, and extra columns are ignored.

```bash
curl -X POST -F "file=@test/fixtures/bookmarks.csv;type=text/csv" \
  http://localhost:3000/v1/imports/bookmarks
```

```json
{ "importId": "…", "totalRows": 6, "imported": 2, "failed": 4,
  "errorReportUrl": "/v1/imports/…/errors.csv" }
```

Partial success is still a successful request, so this is **200** — not 207, which is
WebDAV multi-status and the usual mis-citation here. A bad row never blocks a good one.
The report is a second endpoint because one response cannot be both a JSON summary and a
CSV attachment, and it reports **source line numbers** so you can open the file and go
straight to the problem.

A CSV row is parsed and then piped into the same `createBookmarkSchema` the JSON endpoint
uses, so an import can never produce a bookmark that `POST /v1/bookmarks` would have
rejected.

### Memory behaviour

The whole point of the exercise. Measured on this implementation, importing a file where
every row fails (so nothing is stored and only the streaming path is exercised):

| Rows | File size | Peak RSS |
|---|---|---|
| 300,000 | 22 MB | 288 MB |
| 900,000 | 65 MB | 330 MB |

Tripling the file moved peak memory by about 15%, not 3×. Memory is bounded by the batch
size and GC headroom rather than by file size, which is what backpressure buys. If peak
had tripled, the pipeline would be buffering.

What makes that true:

- `pipeline`, never a chain of `.pipe()` — it propagates errors and destroys every stream
  in the chain, instead of leaking file descriptors and hanging the request.
- `for await` over the parser, so the next record is not pulled until the current one is
  handled. That is backpressure on the read side, for free.
- An explicit `drain` wait on the report writer. `write()` returning `false` means the
  buffer is full; ignoring it rebuilds the problem streaming was meant to solve.
- Rows written to storage in batches of 500.
- The uploaded temp file deleted in a `finally`, on every path.

## Layout

```
src/
├── main.ts          # listens, graceful shutdown
├── app.ts           # builds the app, never listens — Supertest drives this
├── config/          # env parsed through Zod, exits on failure
├── routes/          # paths and the middleware guarding them
├── controllers/     # request in, response out
├── services/        # the rules; throws, knows no HTTP
├── repositories/    # the only code that touches storage
├── models/          # Zod schemas and the types inferred from them
├── middleware/      # validate, error-handler, not-found, upload, http-logger
├── errors/          # http-errors factories
└── utils/           # pino
```

The one discipline this layout needs: **routes → controllers → services → repositories**,
never skipping and never reversing. A controller reaching into a repository because "it's
just a lookup" is how the Prisma migration in layer 3 stops being a one-folder change.

## Known limits

Deliberate for layer 1, and each is addressed later in the roadmap:

- Storage is in memory, so everything is lost on restart.
- Offset pagination, which makes a database walk and discard the rows it skips. Layer 3
  replaces it with cursor pagination.
- The import is synchronous — the client waits. Layer 5 moves it onto a BullMQ queue and
  the endpoint becomes a 202 with a job id.
- No authentication. Layer 4.
- Error reports are temp files on local disk with a TTL, so they do not survive a restart
  and would not work across multiple instances. S3 in layer 5.
