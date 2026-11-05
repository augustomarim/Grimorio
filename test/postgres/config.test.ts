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
