import { readFile } from 'node:fs/promises';
import { buildOpenApiDocument } from '../openapi.ts';
import { routes } from '../descriptors.ts';
import { apiRouter } from '../router.ts';

let failed = false;
const fail = (message: string) => {
  console.error(`✗ ${message}`);
  failed = true;
};
const pass = (message: string) => console.log(`✓ ${message}`);

// Check 1 — is the committed artifact current?
const generated = JSON.stringify(buildOpenApiDocument(), null, 2) + '\n';

try {
  const committed = await readFile(
    new URL('../openapi.json', import.meta.url),
    'utf8',
  );
  if (committed === generated) {
    pass('openapi.json matches the schemas');
  } else {
    fail(
      'openapi.json is stale — run `npm run openapi:generate` and commit the result',
    );
  }
} catch {
  fail('openapi.json is missing — run `npm run openapi:generate`');
}

// Check 2 - did anyone add a route without describing it?
// Reading Express's router stack is undocumented internals, and brittle. It is
// here as a backstop for someone bypassing the descriptors entirely.
type RouterLayer = {
  route?: { path: string; methods: Record<string, boolean> };
};
const stack = (apiRouter as unknown as { stack: RouterLayer[] }).stack;

const registered = new Set(
  stack
    .filter((layer) => layer.route)
    .map(
      (layer) => `${Object.keys(layer.route!.methods)[0]} ${layer.route!.path}`,
    ),
);
const described = new Set(
  routes.map((route) => `${route.method} ${route.path}`),
);

for (const key of registered) {
  if (!described.has(key)) fail(`route is not in the spec: ${key}`);
}
for (const key of described) {
  if (!registered.has(key))
    fail(`spec describes a route that does not exist: ${key}`);
}
if (registered.size === described.size) {
  pass(`${described.size} routes registered, all described`);
}

process.exit(failed ? 1 : 0);
