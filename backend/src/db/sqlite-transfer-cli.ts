import Sqlite from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { openDatabase } from './database.js';
import { migrate } from './migrations.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const file = process.argv[2];
if (!file)
  throw new Error(
    'Informe o caminho do banco SQLite antigo. O destino PostgreSQL deve estar vazio.'
  );
const source = new Sqlite(file, { readonly: true, fileMustExist: true });
const target = openDatabase(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Identificador inválido');
  return '"' + name + '"';
};
try {
  if (
    source.pragma('user_version', { simple: true }) !== 6 ||
    source.pragma('integrity_check', { simple: true }) !== 'ok' ||
    (source.pragma('foreign_key_check') as unknown[]).length
  )
    throw new Error('A origem deve ser SQLite v6 íntegro');
  source.exec('BEGIN');
  await migrate(target);
  const result = await target
    .transaction(async () => {
      const tables = (
        await target
          .prepare(
            "SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename<>'schema_migration' ORDER BY tablename"
          )
          .all()
      ).map((row) => String(row.tablename));
      for (const table of tables)
        if ((await target.prepare('SELECT count(*) n FROM ' + identifier(table)).get()).n !== 0)
          throw new Error('Destino contém dados; transferência cancelada');
      await target.exec('SET CONSTRAINTS ALL DEFERRED');
      let total = 0;
      for (const table of tables) {
        const rows = source.prepare('SELECT * FROM ' + identifier(table)).all() as Record<
          string,
          unknown
        >[];
        for (const row of rows) {
          const columns = Object.keys(row);
          await target
            .prepare(
              'INSERT INTO ' +
                identifier(table) +
                '(' +
                columns.map(identifier).join(',') +
                ') VALUES(' +
                columns.map(() => '?').join(',') +
                ')'
            )
            .run(...columns.map((c) => row[c]));
          total++;
        }
        if (
          !(
            source.prepare('PRAGMA table_info(' + identifier(table) + ')').all() as {
              name: string;
            }[]
          ).some((c) => c.name === 'id')
        )
          continue;
        const sequence = await target
          .prepare('SELECT pg_get_serial_sequence(?,?) name')
          .get(table, 'id');
        if (sequence.name) {
          const old = source.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get(table) as
            | {
                seq: number;
              }
            | undefined;
          const max = (
            await target.prepare('SELECT COALESCE(MAX(id),0) n FROM ' + identifier(table)).get()
          ).n;
          await target
            .prepare('SELECT setval(?::regclass,?,?)')
            .get(sequence.name, Math.max(1, max, old?.seq ?? 0), Math.max(max, old?.seq ?? 0) > 0);
        }
      }
      await target.exec('SET CONSTRAINTS ALL IMMEDIATE');
      return { tables: tables.length, rows: total };
    })
    .immediate();
  console.info(JSON.stringify({ transferred: true, ...result }));
} catch {
  console.error(
    'Transferência cancelada. Verifique SQLite v6, destino vazio, conexão e restrições. O arquivo de origem não foi alterado.'
  );
  process.exitCode = 1;
} finally {
  if (source.inTransaction) source.exec('ROLLBACK');
  source.close();
  await target.close();
}
