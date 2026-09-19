# backendninja

Work from the backend engineering roadmap, one folder per part. This is an npm
workspace: install once here and every project shares the root `node_modules`.

## Layout

One directory per part of the roadmap. Each part has the same two subfolders.

```
backendninja/
├── package.json
├── tsconfig.base.json
├── 1-foundations/
│   ├── practice/
│   └── project/
├── 2-api-architecture/
│   ├── practice/
│   └── project/
│       └── bookmarks-api/
├── 3-core-data-and-storage/
├── 4-concurrency-and-streaming/
├── 5-security-and-identity/
├── 6-observability-and-operations/
└── 7-architecture-and-scale/
```

**`practice/`** holds the short exercises — a few hours each, one concept apiece.
They are for learning, not for showing.

**`project/`** holds the real builds: products with a README, a deploy and a
measured result. These are the ones that go on a resume.

Some modules are study only and produce neither. A written decision record from
one of those belongs in the relevant part's `practice/` folder as a markdown file.

## Setup

```bash
nvm use            # Node 24, from .nvmrc
npm install        # once, from this folder
```

## Commands (run from the repository root)

```bash
npm run dev -w bookmarks-api            # run one project in watch mode
npm test -w bookmarks-api               # test one project
npm test                                # test everything
npm run typecheck                       # typecheck everything
npm install <package> -w bookmarks-api  # add a dependency to one project
```

`-w` takes the `name` from that project's `package.json`, not its folder name.
You can also `cd` into a project and run its scripts directly.

## Rules

- Shared tooling — TypeScript, `@types/node`, linters — goes in the root `package.json`.
- Anything only one project needs is installed into that project with `-w`.
- Only the root has a `package-lock.json`.
- A folder joins the workspace only once it has a `package.json`.
- The workspace globs are `*/project/*` and `*/practice`. Each part's `practice`
  folder is one package holding all of that part's exercises; each project under
  `project/` is its own package.

## Adding a project

1. Create `<part>/project/<name>/` with `src/` and `test/`.
2. Add a `package.json` with a unique `name`, `"private": true` and `"type": "module"`.
3. Add a `tsconfig.json` extending `../../../tsconfig.base.json` — three levels up.
4. Run `npm install` from the root to link it.

## Adding a part's practice package

1. Create `<part>/practice/` with `src/`.
2. Add a `package.json` named `<part>-practice`, plus a `tsconfig.json`
   extending `../../tsconfig.base.json` — two levels up, one fewer than a project.
3. Run `npm install` from the root.

Later exercises in the same part are new files under that `src/`, not new packages.

Projects use a type-first `src/` layout: `controllers/`, `services/`, `models/`,
`repositories/`, `routes/`, `middleware/`, `config/`, `errors/`, `utils/`.
