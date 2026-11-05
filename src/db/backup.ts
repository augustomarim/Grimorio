import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, chmodSync, linkSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { databaseUrl } from '../config.js';
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
        "SELECT count(*) n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
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
  return { restored: true };
}
