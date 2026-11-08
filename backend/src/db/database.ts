import { AsyncLocalStorage } from 'node:async_hooks';
import { databaseUrl } from '../config.js';
import { Pool, types, type PoolClient, type QueryResult } from 'pg';
types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('Inteiro fora da faixa segura');
  return n;
});
export function placeholders(sql: string) {
  let quote = '',
    out = '',
    index = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (quote) {
      out += c;
      if (c === quote) {
        if (sql[i + 1] === quote) {
          out += sql[++i];
        } else quote = '';
      }
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else out += c === '?' ? '$' + ++index : c;
  }
  return out;
}
export class Database {
  private pool: Pool;
  private context = new AsyncLocalStorage<{
    client: PoolClient;
    cache: Map<string, Promise<QueryResult>>;
  }>();
  open = true;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: databaseUrl(url),
      enableChannelBinding: true,
      max: 5,
      connectionTimeoutMillis: 15000,
      query_timeout: 70000,
      idleTimeoutMillis: 30000,
      application_name: 'grimorio',
    });
    // Never log URLs, passwords or tokens when the pool reports a background error.
    this.pool.on('error', () => {});
  }
  async query(sql: string, params: unknown[] = []) {
    const context = this.context.getStore();
    const text = placeholders(sql);
    if (!context) return this.pool.query(text, params);
    const cacheable =
      /^\s*SELECT\b/i.test(text) &&
      !/\b(?:FOR\s+(?:UPDATE|SHARE)|setval|nextval|pg_advisory)\b/i.test(text);
    if (!cacheable) {
      context.cache.clear();
      return context.client.query(text, params);
    }
    const key = JSON.stringify([text, params]);
    let pending = context.cache.get(key);
    if (!pending) {
      pending = context.client.query(text, params);
      context.cache.set(key, pending);
    }
    const result = await pending;
    return { ...result, rows: result.rows.map((row) => ({ ...row })) };
  }
  prepare(sql: string) {
    return {
      get: async (...params: unknown[]) => (await this.query(sql, params)).rows[0],
      all: async (...params: unknown[]) => (await this.query(sql, params)).rows,
      run: async (...params: unknown[]) => {
        const text =
          /^\s*INSERT\b/i.test(sql) && !/\bRETURNING\b/i.test(sql) ? sql + ' RETURNING *' : sql;
        const result = await this.query(text, params);
        return { changes: result.rowCount ?? 0, insertId: result.rows[0]?.id ?? 0 };
      },
    };
  }
  async exec(sql: string) {
    await this.query(sql);
  }
  get inTransaction() {
    return !!this.context.getStore();
  }
  transaction<A extends unknown[], T>(operation: (...args: A) => T | Promise<T>) {
    const perform = async (readOnly: boolean, ...args: A): Promise<T> => {
      const parent = this.context.getStore();
      if (parent) {
        const savepoint = 'nested_' + crypto.randomUUID().replaceAll('-', '');
        await parent.client.query('SAVEPOINT ' + savepoint);
        try {
          const value = await operation(...args);
          await parent.client.query('RELEASE SAVEPOINT ' + savepoint);
          return value;
        } catch (error) {
          await parent.client.query('ROLLBACK TO SAVEPOINT ' + savepoint);
          parent.cache.clear();
          await parent.client.query('RELEASE SAVEPOINT ' + savepoint);
          throw error;
        }
      }
      const client = await this.pool.connect();
      let releaseError: Error | undefined;
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        await client.query("SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='60s'");
        if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(947231062)');
        return await this.context.run({ client, cache: new Map() }, async () => {
          const value = await operation(...args);
          await client.query('COMMIT');
          return value;
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'Query read timeout') {
          // Destroy an unresponsive connection rather than queue another query on it.
          releaseError = error;
        } else
          try {
            await client.query('ROLLBACK');
          } catch {
            releaseError = new Error('Conexão transacional indisponível');
          }
        throw error;
      } finally {
        client.release(releaseError);
      }
    };

    const execute = (...args: A) => perform(false, ...args);
    return Object.assign(execute, {
      immediate: execute,
      deferred: (...args: A) => perform(true, ...args),
    });
  }
  async close() {
    await this.pool.end();
    this.open = false;
  }
}
export function openDatabase(url: string) {
  return new Database(url);
}
