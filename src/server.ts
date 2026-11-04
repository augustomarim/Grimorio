import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadConfig();
const { app } = await buildApp({ config, logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close();
  });
await app.listen({ host: config.host, port: config.port });
if (config.mailMode === 'disabled')
  app.log.warn(
    'E-mail desabilitado: confirmações/reset não são entregues; configure MAIL_MODE=file apenas no desenvolvimento.'
  );
