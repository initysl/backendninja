## Exercise - An OpenAPI spec that cannot drift from the code

> Generate an OpenAPI 3.1 document from your Zod schemas, serve it with
> `swagger-ui-express`, and add a CI check script that fails the build when the
> generated spec and the implementation disagree.

### What it does

A small Products API — list, create, fetch one — where the OpenAPI document is
**generated, never written**.

Every route is declared once as a descriptor: method, path, and the Zod schemas
for its params, query, body and each response. Two things are built from that
same list:

- the **Express router**, with validation middleware wired from those schemas
- the **OpenAPI 3.1 document**, served at `/openapi.json` and rendered at `/docs`

Neither is hand-written, so they cannot disagree. A route that isn't described
doesn't exist, because the router is built from the description.

`openapi.json` is committed, and a check script fails the build when it falls
out of date or when a route appears that the spec doesn't describe.

### Running it

From the repository root:

```bash
npm run openapi -w api-architecture-practice            # server + docs
npm run openapi:generate -w api-architecture-practice   # write openapi.json
npm run openapi:check -w api-architecture-practice      # the CI gate
npm run typecheck -w api-architecture-practice
```

Then open **http://localhost:3000/docs**.

### The API

```
GET   /v1/products        ?limit=20&q=keyboard
POST  /v1/products        → 201 + Location
GET   /v1/products/{id}   → 200 or 404
```

### Proving the CI gate

```bash
npm run openapi:check -w api-architecture-practice
# ✓ openapi.json matches the schemas
# ✓ 3 routes registered, all described
```

Now break it deliberately. Add a field to `ProductSchema`, don't regenerate, and
run the check again — it exits non-zero with _"openapi.json is stale — run
`npm run openapi:generate` and commit the result"_.

That failure is the whole point of the exercise. Everything else is setup.

### Layout

```
openapi-contract/
├── schemas.ts            Zod schemas — the single source of truth
├── descriptors.ts        one descriptor per route: path, method, schemas, handler
├── openapi.ts            builds the OpenAPI 3.1 document from the descriptors
├── router.ts             builds the Express router from the same descriptors
├── server.ts             app + Swagger UI
├── openapi.json          generated, committed, diffed by CI
└── scripts/
    ├── generate.ts       writes openapi.json
    └── check.ts          fails the build on drift
```

### What it demonstrates

**Zod 4 emits JSON Schema natively.** `z.toJSONSchema()` is built in — no
third-party converter. Most guides still recommend one; those libraries existed
to bridge Zod 3 to OpenAPI 3.0, a gap that has closed.

**OpenAPI 3.1 is a superset of JSON Schema 2020-12.** That is exactly why the
exercise specifies 3.1 rather than 3.0. In 3.0 the schema dialect diverged from
JSON Schema and needed translating; in 3.1 the output of `z.toJSONSchema` drops
straight in.

**The same schema produces two different JSON Schemas.** A field with
`.default([])` is _optional_ in a request body — the client may omit it — and
_guaranteed_ in a response, because the server filled it in. `z.toJSONSchema`
takes an `io: 'input' | 'output'` option for precisely this. Generate docs with
the wrong one and you are telling clients to send fields the server owns.

**Prevention beats detection.** The strongest check here is the one that never
runs: routes and docs share a single origin, so they cannot drift by
construction. The CI script exists for the day someone calls `router.get()`
directly and bypasses the design.

**There are three kinds of drift, and this catches two.**

1. The committed spec is stale — caught by regenerating and diffing
2. A route exists that the spec doesn't describe — caught by comparing the
   router's registered routes against the descriptors
3. The implementation violates its own documented contract — **not caught here**

The third needs something that boots the server and exercises it against the
spec, which is what `express-openapi-validator` or a contract test does. A check
that only compares documents to documents can agree with itself perfectly and
still be wrong about what is running.

### Finishing it

Worth doing next, in order of value:

- Tighten `res.locals.validated`, which is currently typed loosely enough that a
  misspelled field compiles. Declaration merging or typed accessors fix it.
- Use `components/schemas` with `$ref` instead of inlining the same Product
  schema in several responses.
- Add a smoke test that boots the app and asserts the spec's `servers` URL
  actually answers — that is drift type 3, and the cheapest version of it.
