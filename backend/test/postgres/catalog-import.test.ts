import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { openDatabase, type Database } from '../../src/db/database.js';
import { migrate } from '../../src/db/migrations.js';
import { importCatalog, type ImportProgress } from '../../src/catalog/import.js';
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const schema = 'import_' + randomUUID().replaceAll('-', '');
let admin: Database, db: Database;
suite('Carga PostgreSQL em lotes e recuperação de bloqueios', () => {
  beforeAll(async () => {
    admin = openDatabase(url!);
    await admin.exec('CREATE SCHEMA ' + schema);
    const conn = new URL(url!);
    conn.searchParams.set('options', '-c search_path=' + schema + ',public');
    db = openDatabase(conn.toString());
    await migrate(db);
  });
  afterAll(async () => {
    if (db) await db.close();
    if (admin) {
      await admin.exec('DROP SCHEMA ' + schema + ' CASCADE');
      await admin.close();
    }
  });
  it('carrega todos os registros com progresso e menos de 250 consultas, mesmo com latência', async () => {
    const progress: ImportProgress[] = [];
    const query = db.query.bind(db);
    const spy = vi.spyOn(db, 'query').mockImplementation(async (sql, params) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return query(sql, params);
    });
    try {
      const result = await importCatalog(db, (event) => progress.push(event));
      expect(result).toMatchObject({ total: 1905, links: 4631 });
      expect(spy.mock.calls.length).toBeLessThan(250);
      expect(progress.some((p) => p.stage === 'Carregando spell' && p.completed === 444)).toBe(
        true
      );
      expect(progress.at(-1)).toMatchObject({ stage: 'Importação confirmada', completed: 1905 });
      expect((await query('SELECT count(*) n FROM lib_link')).rows[0].n).toBe(4631);
    } finally {
      spy.mockRestore();
    }
  });
  it('reimporta sem mudar IDs e deprecia registros ausentes sem apagá-los', async () => {
    const before = await db.prepare('SELECT id,catalog_entry_id FROM lib_spell ORDER BY id').all();
    const extra = await db
      .prepare(
        "INSERT INTO catalog_entry(kind,slug,name) VALUES('feat','test-deprecated-fixture','test fixture')"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO lib_feat(category,setting,is_repeatable,data,catalog_entry_id,catalog_kind) SELECT category,setting,is_repeatable,data,?,'feat' FROM lib_feat ORDER BY id LIMIT 1"
      )
      .run(extra.insertId);
    const result = await importCatalog(db);
    expect(result.deprecated).toBe(1);
    expect(await db.prepare('SELECT id,catalog_entry_id FROM lib_spell ORDER BY id').all()).toEqual(
      before
    );
    expect(
      (await db.prepare('SELECT deprecated_at FROM catalog_entry WHERE id=?').get(extra.insertId))
        .deprecated_at
    ).not.toBeNull();
  });
  it('reverte todos os lotes se houver falha antes da confirmação', async () => {
    const row = await db.prepare('SELECT id,data FROM lib_spell ORDER BY id LIMIT 1').get();
    const sentinel = JSON.stringify({ rollbackTest: true });
    await db.prepare('UPDATE lib_spell SET data=? WHERE id=?').run(sentinel, row.id);
    await expect(
      importCatalog(db, (event) => {
        if (event.stage === 'Carregando spell' && (event.completed ?? 0) >= 100)
          throw new Error('test failure');
      })
    ).rejects.toThrow('test failure');
    expect((await db.prepare('SELECT data FROM lib_spell WHERE id=?').get(row.id)).data).toBe(
      sentinel
    );
    expect((await db.prepare('SELECT count(*) n FROM lib_link').get()).n).toBe(4631);
  });
  it('limita espera pelo lock e devolve conexão utilizável ao pool após rollback', async () => {
    const blocker = new Client({ connectionString: url! });
    await blocker.connect();
    let entered = false;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(947231062)');
      await expect(
        db
          .transaction(async () => {
            entered = true;
          })
          .immediate()
      ).rejects.toMatchObject({ code: '55P03' });
      expect(entered).toBe(false);
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
    }
    expect(
      await db.transaction(async () => (await db.prepare('SELECT 7 AS n').get()).n).immediate()
    ).toBe(7);
  }, 30000);
});
