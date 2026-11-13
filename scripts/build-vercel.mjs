import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { catalogWithSpellIcons, files } from '../frontend/server.mjs';

const output = new URL('../dist/vercel/', import.meta.url);
await mkdir(new URL('spell-icons/', output), { recursive: true });
const assets = new Set([...files.values()].map(([name]) => name));
const frontend = new URL('../frontend/', import.meta.url);
const { illustratedCatalog, spellAssets } = catalogWithSpellIcons(['./spell-icons/']);
await Promise.all([
  ...[...assets].map((name) =>
    copyFile(new URL(name, frontend), new URL(name, output))
  ),
  ...[...spellAssets].map(([path, [name]]) =>
    copyFile(new URL(name, frontend), new URL(path.slice(1), output))
  ),
  writeFile(new URL('catalog.json', output), JSON.stringify(illustratedCatalog)),
]);
