# eng

Projects from the backend engineering roadmap, one folder per layer. This is an npm workspace: install once here, and every project shares the root `node_modules`.

## Setup

```bash
nvm use            # Node 24 (from .nvmrc)
npm install        # once, from this folder
```

## Commands (run from `eng/`)

```bash
npm run dev -w bookmarks-api            # run one project in watch mode
npm test -w bookmarks-api               # test one project
npm test                                # test every project
npm run typecheck                       # typecheck every project
npm install <package> -w bookmarks-api  # add a dependency to one project
```

`-w` takes the `name` from the project's `package.json`. You can also `cd` into a project and run its scripts there.

## Rules

- Shared tooling (TypeScript, @types/node, linters) goes in this root `package.json`.
- Anything only one project needs is installed into that project with `-w`.
- Only the root has a `package-lock.json`.
- A folder is part of the workspace only once it has a `package.json`.
- New layer: add its folder to `workspaces`, e.g. `"apis/*"`.

## New project checklist

1. Create `layer/NN-project-name/` with `src/` and `test/`
2. Add a `package.json` with a unique `name`, `"private": true`, `"type": "module"`, and scripts
3. Add a `tsconfig.json` that extends `../../tsconfig.base.json`
4. Run `npm install` from `eng/` to link it

## Layout

```
eng/
├── package.json
├── tsconfig.base.json
└── fundamentals/
    └── 01-bookmarks-api/
```

Projects use a type-first `src/` layout: `controllers/`, `services/`, `models/`,
`repositories/`, `routes/`, `middleware/`, `config/`, `errors/`, `utils/`.
