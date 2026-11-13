import { createServer, request as httpRequest } from 'node:http';
import { readdirSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import {
  REVISION,
  content,
  feats,
  items,
  languages,
  reference,
  rules,
  glossary,
  alignments,
  spells,
  tools,
} from '@freshmag/one-dndb/data';

export const catalog = {
  revision: REVISION,
  content,
  feats,
  items,
  languages,
  spells,
  tools,
  rules,
  glossary,
  alignments,
  languagePick: reference.languagePick,
};
export const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/reset-password', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/auth.js', ['auth.js', 'text/javascript']],
  ['/characters.js', ['characters.js', 'text/javascript']],
  ['/reference.json', ['reference.json', 'application/json']],
  ['/rules.js', ['rules.js', 'text/javascript']],
  ['/mechanics.js', ['mechanics.js', 'text/javascript']],
  ['/validation.js', ['validation.js', 'text/javascript']],
  ['/spells.js', ['spells.js', 'text/javascript']],
  ['/compendium.js', ['compendium.js', 'text/javascript']],
  ['/glossary.js', ['glossary.js', 'text/javascript']],
  ['/pt-BR.json', ['pt-BR.json', 'application/json']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/game-icons.svg', ['game-icons.svg', 'image/svg+xml']],
  ['/grimorio-dado.svg', ['grimorio-dado.svg', 'image/svg+xml']],
  ['/game-icons-credits.txt', ['game-icons-credits.txt', 'text/plain']],
  ['/hub-castle.webp', ['hub-castle.webp', 'image/webp']],
  ['/hub-dragon.webp', ['hub-dragon.webp', 'image/webp']],
  ['/hub-books.jpg', ['hub-books.jpg', 'image/jpeg']],
  ['/hub-compass.jpg', ['hub-compass.jpg', 'image/jpeg']],
]);
const authRoutes = new Map([
  ['/api/auth/me', 'GET'],
  ...[
    'login',
    'register',
    'profile',
    'password',
    'refresh',
    'logout',
    'password-reset/request',
    'password-reset/confirm',
  ].map((route) => ['/api/auth/' + route, 'POST']),
]);

function proxyAuth(request, response, path, apiOrigin) {
  const method = authRoutes.get(path) ?? request.method;
  if (request.method !== method || !['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    response.writeHead(405, { Allow: method }).end();
    return;
  }
  const headers = {};
  for (const name of [
    'accept',
    'content-type',
    'content-length',
    'cookie',
    'origin',
    'user-agent',
  ]) {
    if (request.headers[name] !== undefined) headers[name] = request.headers[name];
  }
  const callApi = apiOrigin.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = callApi(new URL(request.url, apiOrigin), { method, headers }, (incoming) => {
    const outgoing = { 'Cache-Control': 'no-store' };
    for (const name of ['content-type', 'set-cookie', 'retry-after']) {
      if (incoming.headers[name] !== undefined) outgoing[name] = incoming.headers[name];
    }
    response.writeHead(incoming.statusCode, outgoing);
    incoming.on('error', () => response.destroy());
    incoming.pipe(response);
  });
  upstream.setTimeout(10000, () => upstream.destroy());
  upstream.on('error', () => {
    if (response.headersSent) return response.destroy();
    response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(
      JSON.stringify({
        error: {
          message: 'O serviço de contas está indisponível. Inicie o site com npm run dev:site.',
        },
      })
    );
  });
  response.on('close', () => {
    if (!response.writableFinished) upstream.destroy();
  });
  request.pipe(upstream);
}

export function createFrontend(origin) {
  const apiOrigin = new URL(origin);
  if (
    !['http:', 'https:'].includes(apiOrigin.protocol) ||
    apiOrigin.origin + '/' !== apiOrigin.href
  )
    throw new Error('FRONTEND_API_ORIGIN deve conter somente a origem HTTP(S) da API.');
  const localIconFolder = new URL('../data/spell-icons/', import.meta.url);
  const localIconFiles = new Set(readdirSync(localIconFolder, { throwIfNoEntry: false }) ?? []);
  const spellAssets = new Map();
  const catalogJson = JSON.stringify({
    ...catalog,
    spells: spells.map((spell) => {
      const filename = spell.id + '.webp';
      if (!localIconFiles.has(filename)) return spell;
      const localIcon = '/spell-icons/' + filename;
      spellAssets.set(localIcon, ['../data/spell-icons/' + filename, 'image/webp']);
      return { ...spell, localIcon };
    }),
  });
  return createServer(async (request, response) => {
    const path = request.url?.split('?')[0];
    if (authRoutes.has(path)) {
      proxyAuth(request, response, path, apiOrigin);
      return;
    }
    if (/^\/api\/builder(?:\/public)?(?:\/[a-f\d-]{36})?$/i.test(path)) {
      proxyAuth(request, response, path, apiOrigin);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/catalog.json') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      response.end(catalogJson);
      return;
    }
    const asset = files.get(path) ?? spellAssets.get(path);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    const [name, type] = asset;
    try {
      const data = await readFile(new URL(name, import.meta.url));
      response.writeHead(200, {
        'Content-Type': type.startsWith('image/') ? type : type + '; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    } catch {
      response.writeHead(500).end();
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.FRONTEND_PORT || 4173);
  createFrontend(process.env.FRONTEND_API_ORIGIN || 'http://127.0.0.1:3000').listen(
    port,
    '127.0.0.1',
    () => console.log(`Grimório em http://127.0.0.1:${port}`)
  );
}
