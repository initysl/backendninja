# Project conventions

How a TypeScript backend project should be configured, and how much of that
applies here.

## Scope of this repository

This repo is for **practice and learning** against the backend roadmap. Real
products live in their own repositories, because each one needs its own README,
deploy and link to be worth showing.

That distinction decides how much configuration is appropriate. Config should
scale with what the thing is for. Adding a Dockerfile and a CI pipeline to a
four-file exercise is cargo-culting, and it costs the time the exercise was
meant to take.

## Three kinds of thing, three configurations

Most bad setups come from applying one kind's config to another.

| Kind | Needs | Does not need |
|---|---|---|
| **Script or exercise** | `package.json`, `tsconfig.json`, `src/` | Docker, CI, tests, lint config, env files |
| **Deployable service** | Everything below | Publishing config, `exports` map |
| **Published library** | Build to `dist/`, `exports` map, declaration files, changesets | Dockerfile, `.env` |

## A deployable service: the full anatomy

```
service/
├── package.json
├── package-lock.json          committed, always
├── tsconfig.json              editor + typecheck
├── tsconfig.build.json        production build, excludes tests
├── .nvmrc                     pins the Node version
├── .env.example               committed; .env never is
├── .gitignore
├── .editorconfig
├── eslint.config.js           flat config
├── .prettierrc
├── Dockerfile
├── .dockerignore
├── docker-compose.yml         Postgres, Redis for local development
├── .github/workflows/ci.yml
├── .husky/
├── README.md
├── src/
└── test/
```

The four people skip and shouldn't:

**`.dockerignore`** — without it, `COPY . .` ships `node_modules`, `.git` and
`.env` into the image. That is a security incident, not untidiness.

**`.env.example`** — the contract for what the app needs. It answers a new
developer's first question without a message to anyone.

**`tsconfig.build.json`** — the editor wants tests type-checked; the production
build does not want them compiled into `dist/`. One config cannot do both well.

**`.nvmrc`** — "works on my machine" is usually a Node version.

## Layout inside `src/`

Two shapes, both standard, dominant in different places.

**Layered** — the norm for a service with one or two domains:

```
src/
├── main.ts          entrypoint: listens, handles signals
├── app.ts           composition: builds the app, never listens
├── config/
├── routes/
├── controllers/
├── services/
├── repositories/
├── models/
├── middleware/
└── utils/
```

**Feature modules** — takes over at the scale where "who owns this folder"
becomes a real question, and what NestJS enforces:

```
src/
├── main.ts
├── modules/
│   └── orders/
│       ├── orders.controller.ts
│       ├── orders.service.ts
│       ├── orders.repository.ts
│       └── orders.schema.ts
└── shared/
```

The detail that matters in either shape is splitting `main.ts` from `app.ts`.
An app factory that never calls `listen` can be driven in-process by tests: no
port to bind, no collisions, parallel runs.

## Dependencies

**The dividing line is whether production needs it at runtime.**

```
dependencies      express, zod, pino, prisma, ioredis
devDependencies   typescript, @types/*, vitest, eslint, prettier, tsx
```

This is not bookkeeping. A Dockerfile runs `npm ci --omit=dev`, so a misfiled
package either bloats the image or crashes at startup. Putting `typescript` in
`dependencies` ships a compiler to production.

**Declare where it is used.** In a workspace, a package that imports `express`
declares `@types/express` itself, even though npm hoists the files to the root.
The declaration is the documentation.

**Ranges and lockfiles.** Carets for applications; the lockfile is what actually
pins you. Commit it. Use `npm ci` in CI, never `npm install` — `ci` installs the
lockfile exactly and fails when it disagrees with `package.json`.

**A dependency is a liability.** Before adding one: last publish date, number of
maintainers, transitive weight. `npm audit` reports known CVEs, not abandonment,
which is the more common problem.

## Compiler options worth having

Beyond `strict: true`:

- **`noUncheckedIndexedAccess`** — types `arr[0]` as possibly `undefined`. It is
  noisy to adopt late but catches a real class of bug. Enabling it on this repo
  surfaced a genuine one: a Zod `.transform(items => items[0])` that would have
  thrown a `TypeError` on an empty array instead of failing validation cleanly.
- **`verbatimModuleSyntax`** — forces `import type` for type-only imports.
  Essential when running TypeScript through Node's native type stripping, which
  cannot infer what is a type and will leave a dead import to fail at runtime.
- **`exactOptionalPropertyTypes`** — distinguishes "absent" from "present and
  `undefined`". Correct, and occasionally annoying.

## The build question

What most teams still do:

```json
"dev":   "tsx watch src/main.ts",
"build": "tsc -p tsconfig.build.json",
"start": "node dist/main.js"
```

Compile to `dist/`, ship `dist/` plus production dependencies. Boring and
universal.

This repo instead runs TypeScript directly through **Node's native type
stripping** — no build step. That is legitimate and increasingly common, with
real tradeoffs: startup cost on every boot rather than once at build time,
source maps needing extra care for production stack traces, and no support for
decorators, which rules out NestJS and TypeORM.

The important consequence: **stripping never type-checks**. A type error can
reach production because nothing checked it. `npm run typecheck` must be a
separate gate, not an afterthought.

## Tooling, honestly labelled

| Concern | Dominant | Rising |
|---|---|---|
| Lint | ESLint + typescript-eslint | Biome |
| Format | Prettier | Biome |
| Test | Jest in existing code, Vitest for new | `node:test` |
| Package manager | npm | pnpm |
| Monorepo | pnpm workspaces + Turborepo | Nx |

Genuine non-consensus, where anyone claiming one right answer is selling
something: ESM versus CommonJS, colocated tests versus a `test/` directory, and
Biome versus ESLint.

## What this repo deliberately omits

No Dockerfile, no CI, no commit hooks, no release tooling, no deployment. Those
belong in the product repositories, where they will also be assessed.

What it does have, because each solves a real problem:

- **npm workspaces** — one `node_modules`, one lockfile, shared types.
- **`tsconfig.base.json`** — one place for compiler settings; each package
  extends it.
- **`.prettierrc` and `.editorconfig`** — without them, formatting is whatever
  each editor decides, which shows up as noise in every diff.

Commit hooks and CI arrive with roadmap module 1.3, as an exercise rather than
as setup.

## The part that separates good from average

Everything above is table stakes. What actually distinguishes a well-configured
repository is that **the checks are enforced rather than merely available.**

A repo where `lint` exists but CI never runs it, and `typecheck` passes locally
but nothing blocks a merge, is configured in name only. The standard is:
pre-commit hooks catch it in seconds, CI catches it in minutes, and the default
branch is protected so neither can be skipped.
