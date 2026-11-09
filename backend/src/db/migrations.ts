import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database } from './database.js';
export const MIGRATIONS_DIRECTORY = resolve(import.meta.dirname, '../../migrations/postgresql');
const history =
  'CREATE TABLE IF NOT EXISTS schema_migration(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum_sha256 TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\'))';
const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');
function files(directory: string) {
  return readdirSync(directory)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((name, index) => {
      if (!new RegExp('^' + String(index + 1).padStart(4, '0') + '_[a-z0-9_]+\\.sql$').test(name))
        throw new Error('Sequência de migrações inválida');
      const sql = readFileSync(resolve(directory, name), 'utf8').replaceAll('\r\n', '\n');
      return {
        version: index + 1,
        name,
        sql,
        checksum: checksum(sql),
        windowsChecksum: checksum(sql.replaceAll('\n', '\r\n')),
      };
    });
}
export async function verifyHistory(db: Database, directory = MIGRATIONS_DIRECTORY) {
  const expected = files(directory);
  const exists = await db.prepare("SELECT to_regclass('schema_migration') present").get();
  if (!exists?.present) return 0;
  const rows = await db
    .prepare('SELECT version,name,checksum_sha256 FROM schema_migration ORDER BY version')
    .all();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i],
      e = expected[i];
    if (
      !e ||
      r.version !== e.version ||
      r.name !== e.name ||
      ![e.checksum, e.windowsChecksum].includes(r.checksum_sha256)
    )
      throw new Error('Histórico de migrações incompatível');
  }
  return rows.length;
}
export async function migrate(db: Database, directory = MIGRATIONS_DIRECTORY) {
  return db
    .transaction(async () => {
      await db.query('SELECT pg_advisory_xact_lock(947231061)');
      await db.exec(history);
      const current = await verifyHistory(db, directory);
      for (const file of files(directory).slice(current)) {
        if (/\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(file.sql))
          throw new Error('Transação embutida não permitida');
        await db.exec(file.sql);
        await db
          .prepare('INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(?,?,?)')
          .run(file.version, file.name, file.checksum);
      }
      return verifyHistory(db, directory);
    })
    .immediate();
}

export async function requireCurrentSchema(db: Database) {
  const current = await verifyHistory(db),
    expected = files(MIGRATIONS_DIRECTORY).length;
  if (current !== expected)
    throw new Error(
      'Banco desatualizado: execute db:migrate com a conexão direta antes de iniciar produção'
    );
  return current;
}
