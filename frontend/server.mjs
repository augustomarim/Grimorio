import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import {
  REVISION,
  content,
  feats,
  items,
  languages,
  reference,
  spells,
  tools,
} from '@freshmag/one-dndb/data';

const catalog = JSON.stringify({
  revision: REVISION,
  content,
  feats,
  items,
  languages,
  spells,
  tools,
  languagePick: reference.languagePick,
});
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/verify-email', ['index.html', 'text/html']],
  ['/reset-password', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/auth.js', ['auth.js', 'text/javascript']],
  ['/rules.js', ['rules.js', 'text/javascript']],
  ['/spells.js', ['spells.js', 'text/javascript']],
  ['/pt-BR.json', ['pt-BR.json', 'application/json']],
  ['/styles.css', ['styles.css', 'text/css']],
]);
const authRoutes = new Map([
  ['/api/auth/me', 'GET'],
  ...[
    'login',
    'register',
    'refresh',
    'logout',
    'email-verification/request',
    'email-verification/confirm',
    'password-reset/request',
    'password-reset/confirm',
  ].map((route) => ['/api/auth/' + route, 'POST']),
]);

function proxyAuth(request, response, path, apiOrigin) {
  const method = authRoutes.get(path);
  if (request.method !== method) {
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
  const upstream = callApi(new URL(path, apiOrigin), { method, headers }, (incoming) => {
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
  return createServer(async (request, response) => {
    const path = request.url?.split('?')[0];
    if (authRoutes.has(path)) {
      proxyAuth(request, response, path, apiOrigin);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/catalog.json') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      response.end(catalog);
      return;
    }
    const asset = files.get(path);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    const [name, type] = asset;
    try {
      const data = await readFile(new URL(name, import.meta.url));
      response.writeHead(200, {
        'Content-Type': type + '; charset=utf-8',
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
