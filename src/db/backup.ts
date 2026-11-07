import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, chmodSync, linkSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { databaseUrl } from '../config.js';
import { verifyHistory } from './migrations.js';
import { openDatabase } from './database.js';
function connectionEnv(connection: string) {
  const url = new URL(databaseUrl(connection));
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'prefer',
    ...(url.searchParams.get('sslmode') === 'verify-full'
      ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT || 'system' }
      : {}),
    PGCONNECT_TIMEOUT: '15',
  };
}
async function command(program: string, args: string[], env = process.env) {
  return new Promise<void>((done, fail) => {
    const child = spawn(program, args, { env, stdio: ['ignore', 'ignore', 'ignore'] });
    child.once('error', () =>
      fail(
        new Error(
          'Instale os utilitários PostgreSQL 17 (pg_dump/pg_restore) ou use a imagem Docker'
        )
      )
    );
    child.once('exit', (code) =>
      code === 0 ? done() : fail(new Error('Operação PostgreSQL falhou; nenhum segredo é exibido'))
    );
  });
}
export async function inspectBackup(path: string) {
  await command('pg_restore', ['--list', resolve(path)]);
  return { format: 'postgresql-custom', archiveValid: true };
}
export async function backupDatabase(connection: string, destination: string) {
  const output = resolve(destination);
  if (existsSync(output)) throw new Error('Destino já existe');
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const tmp = mkdtempSync(join(dirname(output), '.pg-backup-'));
  const file = join(tmp, 'backup.dump');
  try {
    await command(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--file=' + file],
      connectionEnv(connection)
    );
    chmodSync(file, 0o600);
    await inspectBackup(file);
    linkSync(file, output);
    return { path: output, format: 'postgresql-custom' };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
export async function restoreDatabase(source: string, connection: string) {
  await inspectBackup(source);
  const db = openDatabase(databaseUrl(connection));
  try {
    const count = await db
      .prepare(
        "SELECT count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','S','v','m','f') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')"
      )
      .get();
    if (count.n !== 0) throw new Error('Restauração exige banco de destino vazio');
  } finally {
    await db.close();
  }
  await command(
    'pg_restore',
    [
      '--dbname=' + decodeURIComponent(new URL(connection).pathname.slice(1)),
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      resolve(source),
    ],
    connectionEnv(connection)
  );
  const restored = openDatabase(databaseUrl(connection));
  try {
    const schemaVersion = await verifyHistory(restored);
    if (schemaVersion === 0) throw new Error('Sem histórico');
    const invalid = await restored
      .prepare(
        "SELECT count(*) n FROM pg_constraint WHERE contype='f' AND NOT convalidated AND connamespace='public'::regnamespace"
      )
      .get();
    if (invalid.n) throw new Error('FK não validada');
    const characters = (await restored.prepare('SELECT count(*) n FROM character').get()).n;
    await restored
      .transaction(async () => {
        const time = new Date().toISOString();
        await restored.prepare('UPDATE session SET revoked_at=COALESCE(revoked_at,?)').run(time);
        await restored
          .prepare('UPDATE refresh_token SET revoked_at=COALESCE(revoked_at,?)')
          .run(time);
        await restored
          .prepare('UPDATE auth_token SET revoked_at=COALESCE(revoked_at,?) WHERE used_at IS NULL')
          .run(time);
        await restored
          .prepare(
            "INSERT INTO audit_log(action,entity_type,details) VALUES('operations.restore','system',?)"
          )
          .run(JSON.stringify({ credentialsRevoked: true }));
      })
      .immediate();
    return { restored: true, schemaVersion, characters, credentialsRevoked: true };
  } catch {
    throw Object.assign(
      new Error(
        'Restaurado, mas não validado: não aponte a API para o destino antes de investigar'
      ),
      { code: 'RESTORE_VERIFICATION_FAILED' }
    );
  } finally {
    await restored.close();
  }
}
