import { writeFile } from 'node:fs/promises';
import { buildOpenApiDocument } from '../openapi.ts';

const target = new URL('../openapi.json', import.meta.url);
await writeFile(target, JSON.stringify(buildOpenApiDocument(), null, 2) + '\n');
console.log('wrote openapi.json');
