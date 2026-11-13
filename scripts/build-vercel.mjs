import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { catalog, files } from '../frontend/server.mjs';

const output = new URL('../dist/vercel/', import.meta.url);
await mkdir(output, { recursive: true });
const assets = new Set([...files.values()].map(([name]) => name));
await Promise.all([
  ...[...assets].map((name) =>
    copyFile(new URL('../frontend/' + name, import.meta.url), new URL(name, output))
  ),
  writeFile(new URL('catalog.json', output), JSON.stringify(catalog)),
]);
