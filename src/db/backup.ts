import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, chmodSync, linkSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { verifyHistory } from './migrations.js';
export function inspectBackup(path: string) {
  const db = new Database(resolve(path), { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check') as { integrity_check: string }[];
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw new Error('Integridade do banco inválida');
    return {
      schemaVersion: verifyHistory(db),
      characters: (db.prepare('SELECT count(*) n FROM character').get() as { n: number }).n,
    };
  } finally {
    db.close();
  }
}
// SQLite online backup includes committed WAL transactions; copying only .db does not.
export async function backupDatabase(source: string, destination: string) {
  const input = resolve(source),
    output = resolve(destination);
  if (
    input === output ||
    existsSync(output) ||
    existsSync(output + '-wal') ||
    existsSync(output + '-shm')
  )
    throw new Error('Destino deve ser novo e diferente da origem');
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(join(dirname(output), '.grimorio-backup-'));
  const file = join(temporary, 'backup.db');
  let db: Database.Database | undefined;
  try {
    db = new Database(input, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout=5000');
    await db.backup(file);
    db.close();
    db = undefined;
    chmodSync(file, 0o600);
    const result = inspectBackup(file);
    // Atomic publication, no replacement even if another process creates the target.
    linkSync(file, output);
    return { ...result, path: output };
  } finally {
    if (db?.open) db.close();
    rmSync(temporary, { recursive: true, force: true });
  }
}
export async function restoreDatabase(source: string, destination: string) {
  inspectBackup(source);
  // This deliberately never overwrites a live database. Stop the server and choose a new path.
  return backupDatabase(source, destination);
}
