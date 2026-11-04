import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export const MIGRATIONS_DIRECTORY = resolve(import.meta.dirname, '../../migrations');
interface Migration {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}
interface History {
  version: number;
  name: string;
  checksum_sha256: string;
}
function files(directory: string): Migration[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name, index) => {
      const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
      if (!match || Number(match[1]) !== index + 1)
        throw new Error('Sequência de migrações inválida');
      const bytes = readFileSync(resolve(directory, name));
      return {
        version: index + 1,
        name,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        sql: bytes.toString('utf8'),
      };
    });
}
// Separação léxica: respeita strings/comentários; não admite triggers neste contrato inicial.
export function splitSql(sql: string): string[] {
  const result: string[] = [];
  let start = 0;
  let quote = '';
  let line = false;
  let block = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!,
      n = sql[i + 1];
    if (line) {
      if (c === '\n') line = false;
      continue;
    }
    if (block) {
      if (c === '*' && n === '/') {
        block = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (n === quote) i++;
        else quote = '';
      }
      continue;
    }
    if (c === '-' && n === '-') {
      line = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === ';') {
      result.push(sql.slice(start, i + 1));
      start = i + 1;
    }
  }
  const tail = sql
    .slice(start)
    .replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (tail || quote || block) throw new Error('Migração SQL incompleta');
  return result;
}
export function verifyHistory(
  db: Database.Database,
  migrations = files(MIGRATIONS_DIRECTORY)
): number {
  const version = db.pragma('user_version', { simple: true }) as number;
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migration' AND type='table'")
    .get();
  if (!exists) {
    if (version || db.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())
      throw new Error('Banco sem histórico; conciliação necessária');
    return 0;
  }
  const rows = db
    .prepare('SELECT version,name,checksum_sha256 FROM schema_migration ORDER BY version')
    .all() as History[];
  if (rows.length !== version || version > migrations.length)
    throw new Error('Versão do banco incompatível');
  rows.forEach((row, index) => {
    const expected = migrations[index];
    if (
      !expected ||
      row.version !== expected.version ||
      row.name !== expected.name ||
      row.checksum_sha256 !== expected.checksum
    )
      throw new Error('Histórico ou checksum de migração inválido');
  });
  return version;
}
export function migrate(db: Database.Database, directory = MIGRATIONS_DIRECTORY): number {
  const migrations = files(directory);
  for (;;) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = verifyHistory(db, migrations),
        migration = migrations[current];
      if (!migration) {
        db.exec('ROLLBACK');
        return current;
      }
      for (const sql of splitSql(migration.sql)) {
        const head = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').trim();
        if (
          /^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|VACUUM|ATTACH|DETACH|PRAGMA)\b/i.test(
            head
          ) ||
          /^CREATE\s+(?:TEMP\s+)?TRIGGER\b/i.test(head)
        )
          throw new Error('Comando fora do contrato de migração');
        db.prepare(sql).run();
      }
      if ((db.pragma('foreign_key_check') as unknown[]).length)
        throw new Error('Migração violou FKs');
      if (db.pragma('integrity_check', { simple: true }) !== 'ok')
        throw new Error('Integridade inválida');
      db.prepare('INSERT INTO schema_migration(version,name,checksum_sha256) VALUES(?,?,?)').run(
        migration.version,
        migration.name,
        migration.checksum
      );
      db.pragma(`user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      if (db.inTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
}
