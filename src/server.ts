import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadConfig();
const { app } = await buildApp({ config, logger: true });
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    app.log.info({ event: 'shutdown', signal }, 'Encerrando servidor');
    const force = setTimeout(() => {
      app.log.error({ event: 'shutdown_timeout' }, 'Prazo de encerramento excedido');
      process.exit(1);
    }, 25000);
    force.unref();
    void app.close().then(
      () => {
        clearTimeout(force);
      },
      () => {
        clearTimeout(force);
        process.exitCode = 1;
      }
    );
  });
await app.listen({ host: config.host, port: config.port });
if (config.mailMode === 'disabled')
  app.log.warn(
    'E-mail desabilitado: confirmações/reset não são entregues; configure MAIL_MODE=file apenas no desenvolvimento.'
  );
