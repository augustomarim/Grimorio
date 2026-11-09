import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../backend/src/app.ts';
import { loadConfig } from '../backend/src/config.ts';
import { createFrontend } from '../frontend/server.mjs';

const root = new URL('../', import.meta.url);
const envFile = ['backend/.env', '.env'].map((name) => new URL(name, root)).find(existsSync);
if (envFile) process.loadEnvFile(fileURLToPath(envFile));

const port = Number(process.env.FRONTEND_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('FRONTEND_PORT inválida');
const address = '127.0.0.1';
const origin = `http://${address}:${port}`;
let app;
let frontend;

try {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'development',
    HOST: address,
    PORT: '0',
    APP_ORIGIN: origin,
    PUBLIC_API_ORIGIN: origin,
    API_PREFIX: '/api',
    COOKIE_SAME_SITE: 'lax',
    TRUSTED_PROXIES: '',
    MAIL_MODE: 'file',
    MAIL_DIRECTORY: fileURLToPath(new URL('data/mail/', root)),
  });
  ({ app } = await buildApp({ config, verifyDatabase: true, logger: true }));
  const apiOrigin = await app.listen({ host: config.host, port: config.port });
  frontend = createFrontend(apiOrigin);
  frontend.listen(port, address);
  await once(frontend, 'listening');
  console.log(`Grimório em ${origin} · API de contas conectada`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      frontend.close();
      await app.close();
    });
  }
} catch (error) {
  frontend?.close();
  await app?.close();
  if (error.code === 'EADDRINUSE') {
    console.error(
      `A porta ${port} está ocupada. Pare a prévia antiga ou escolha outra FRONTEND_PORT.`
    );
  } else {
    console.error('Não foi possível iniciar o Grimório:', error.code || error.message);
  }
  process.exitCode = 1;
}
