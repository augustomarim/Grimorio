import { describe, it, expect } from 'vitest';
import { databaseUrl, loadConfig } from '../../src/config.js';
import { placeholders } from '../../src/db/database.js';
describe('Configuração PostgreSQL/Neon', () => {
  it('exige URL PostgreSQL e não aceita caminho SQLite', () => {
    for (const value of [undefined, './data/grimorio.db', 'http://example.invalid/db'])
      expect(() => databaseUrl(value)).toThrow();
  });
  it('exige verificação TLS completa em conexões externas', () => {
    const value = new URL(
      databaseUrl('postgresql://user:secret@example.neon.tech/neondb?sslmode=require')
    );
    expect(value.searchParams.get('sslmode')).toBe('verify-full');
  });
  it('permite conexão local de testes mas força TLS em produção', () => {
    const url = 'postgresql://user:secret@127.0.0.1/db?sslmode=disable';
    expect(new URL(databaseUrl(url)).searchParams.get('sslmode')).toBe('disable');
    expect(new URL(databaseUrl(url, true)).searchParams.get('sslmode')).toBe('verify-full');
  });
  it('não transforma interrogações em strings SQL e parametriza valores', () => {
    expect(placeholders("SELECT '?' AS literal,? AS value, 'it''s ?' AS quoted WHERE x=?")).toBe(
      "SELECT '?' AS literal,$1 AS value, 'it''s ?' AS quoted WHERE x=$2"
    );
  });
  it('preserva proteção HTTPS e SMTP obrigatório em produção', () => {
    const env = {
      AUTH_KEY: 'test-only-key-with-32-or-more-characters',
      DATABASE_URL: 'postgresql://user:secret@example.neon.tech/db',
      NODE_ENV: 'production',
      APP_ORIGIN: 'http://example.invalid',
    };
    expect(() => loadConfig(env)).toThrow('HTTPS');
    expect(() => loadConfig({ ...env, APP_ORIGIN: 'https://example.invalid' })).toThrow('smtp');
  });
});

describe('Conexão transacional sem resposta', () => {
  it('descarta a conexão após timeout de leitura sem aguardar outro comando', async () => {
    const { vi } = await import('vitest');
    const { openDatabase } = await import('../../src/db/database.js');
    const db = openDatabase('postgresql://user:secret@127.0.0.1/test?sslmode=disable');
    const query = vi.fn().mockResolvedValue({ rows: [] }),
      release = vi.fn();
    const pool = (db as unknown as { pool: { connect: () => Promise<unknown> } }).pool;
    const spy = vi.spyOn(pool, 'connect').mockResolvedValue({ query, release });
    try {
      await expect(
        db
          .transaction(async () => {
            throw new Error('Query read timeout');
          })
          .immediate()
      ).rejects.toThrow('Query read timeout');
      expect(query.mock.calls.some((args) => args[0] === 'ROLLBACK')).toBe(false);
      expect(release).toHaveBeenCalledWith(expect.any(Error));
    } finally {
      spy.mockRestore();
      await db.close();
    }
  });
});
