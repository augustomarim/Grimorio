import { describe, it, expect, vi, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from '../src/config.js';
import { mailContent, SmtpMailer } from '../src/auth/mail.js';
import { bucketHash } from '../src/auth/crypto.js';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { migrate } from '../src/db/migrations.js';
import { backupDatabase, restoreDatabase, inspectBackup } from '../src/db/backup.js';
const production = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://example.invalid',
  AUTH_KEY: 'test-only-secret-at-least-32-characters',
  MAIL_MODE: 'smtp',
  SMTP_HOST: 'smtp.example.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'test',
  SMTP_PASSWORD: 'test-secret',
  SMTP_FROM: 'noreply@example.invalid',
};
afterEach(() => vi.restoreAllMocks());
describe('Configuração de produção e SMTP', () => {
  it('exige HTTPS e SMTP configurado e não aceita e-mail desabilitado em produção', () => {
    expect(() => loadConfig({ ...production, APP_ORIGIN: 'http://example.invalid' })).toThrow(
      'HTTPS'
    );
    for (const mode of ['disabled', 'file'])
      expect(() => loadConfig({ ...production, MAIL_MODE: mode })).toThrow('smtp');
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'])
      expect(() => loadConfig({ ...production, [key]: '' })).toThrow('Configure SMTP');
    expect(() => loadConfig({ ...production, SMTP_PORT: '25' })).toThrow('Configure SMTP');
  });
  it('aceita somente IPs explícitos de proxies e preserva o padrão sem confiança', () => {
    expect(loadConfig(production).trustedProxies).toEqual([]);
    expect(
      loadConfig({ ...production, TRUSTED_PROXIES: '172.30.0.2, ::1' }).trustedProxies
    ).toEqual(['172.30.0.2', '::1']);
    for (const value of ['true', '*', '1', '0.0.0.0/0'])
      expect(() => loadConfig({ ...production, TRUSTED_PROXIES: value })).toThrow(
        'TRUSTED_PROXIES'
      );
  });
  it('mantém token no fragmento do link, sem inserir em query ou assunto', () => {
    const result = mailContent(
      { to: 'test@example.invalid', purpose: 'password_reset', token: 'abc&/?#secret' },
      production.APP_ORIGIN
    );
    const link = result.text.split('\n')[1]!;
    const url = new URL(link);
    expect(url.pathname).toBe('/reset-password');
    expect(url.search).toBe('');
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe('abc&/?#secret');
    expect(result.subject).not.toContain('secret');
  });
  it('configura STARTTLS obrigatório e envia para transporte local simulado', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport);
    const config = loadConfig(production);
    const mailer = new SmtpMailer(config.smtp!, config.origin);
    await mailer.send({
      to: 'test@example.invalid',
      purpose: 'email_verification',
      token: 'not-a-real-token',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: false,
        requireTLS: true,
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: { minVersion: 'TLSv1.2' },
      })
    );
  });
});
describe('Saúde de produção', () => {
  it('não anuncia como saudável um catálogo vazio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grimorio-production-'));
    const config = loadConfig({
      ...production,
      DATABASE_PATH: join(dir, 'test.db'),
      TRUSTED_PROXIES: '172.30.0.2',
    });
    const { app, db } = await buildApp({ config, mailer: { send: async () => {} } });

    try {
      expect((await app.inject('/health')).statusCode).toBe(503);
      for (const [remote, expected] of [
        ['192.0.2.9', '192.0.2.9'],
        ['172.30.0.2', '198.51.100.9'],
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: remote!,
          headers: { origin: config.origin, 'x-forwarded-for': '198.51.100.9' },
          payload: { email: 'unknown@example.invalid', password: 'not-a-password' },
        });
        expect(response.statusCode).toBe(401);
        expect(
          db
            .prepare("SELECT 1 FROM login_throttle WHERE scope='network' AND key_hash=?")
            .get(bucketHash(config.authKey, 'network', expected!))
        ).toBeDefined();
      }
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Backup e restauração SQLite reais', () => {
  it('preserva escritas em WAL, valida cópia e restaura sem substituir arquivos existentes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grimorio-backup-'));
    const source = join(dir, 'live.db'),
      backup = join(dir, 'backup.db'),
      restored = join(dir, 'restored.db');
    const db = openDatabase(source);
    try {
      migrate(db);
      db.prepare("INSERT INTO rpg_system(code,name,edition) VALUES('dnd-2024','D&D','2024')").run();
      expect(existsSync(source + '-wal')).toBe(true);
      const result = await backupDatabase(source, backup);
      expect(result.schemaVersion).toBe(6);
      expect(inspectBackup(backup)).toMatchObject({ schemaVersion: 6, characters: 0 });
      await expect(backupDatabase(source, backup)).rejects.toThrow('Destino');
      await restoreDatabase(backup, restored);
      const copy = new Database(restored, { readonly: true });
      try {
        expect(copy.prepare('SELECT name FROM rpg_system').get()).toEqual({ name: 'D&D' });
      } finally {
        copy.close();
      }
      await expect(restoreDatabase(backup, source)).rejects.toThrow('Destino');
      expect(db.prepare('SELECT name FROM rpg_system').get()).toEqual({ name: 'D&D' });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
