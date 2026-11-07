import { existsSync } from 'node:fs';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { importCatalog, type ImportProgress } from './import.js';
if (existsSync('.env')) process.loadEnvFile('.env');
let stage = 'Conectando e preparando schema';
const started = Date.now();
const update = ({ stage: label, completed, total }: ImportProgress) => {
  stage = label;
  console.info(`[catálogo] ${label}${completed === undefined ? '' : `: ${completed}/${total}`}`);
};
update({ stage });
const heartbeat = setInterval(
  () =>
    console.info(`[catálogo] ${stage} — ${Math.round((Date.now() - started) / 1000)}s decorridos`),
  10000
);
heartbeat.unref();
let db: ReturnType<typeof openDatabase> | undefined;
try {
  db = openDatabase(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
  await migrate(db);
  console.info(JSON.stringify(await importCatalog(db, update), null, 2));
} catch (error) {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  const message =
    error instanceof Error && error.message === 'Query read timeout'
      ? 'O banco não respondeu em 70s. Confira a conexão e tente novamente; reimportar não duplica registros.'
      : code === '55P03'
        ? 'Outro processo manteve um bloqueio por mais de 15s. Encerre a importação antiga/servidor de desenvolvimento antes de tentar novamente.'
        : code === '57014'
          ? 'Uma consulta excedeu 60s e foi cancelada. A importação não foi confirmada.'
          : code === 'ENOTFOUND'
            ? 'O endereço do banco não foi localizado. Confira a URL no .env.'
            : 'Não foi possível concluir. Confira a conexão direta e as permissões do banco; nenhuma URL ou senha é exibida.';
  console.error(`[catálogo] ${message}${code ? ` Código: ${code}` : ''}`);
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  if (db) await db.close();
}
