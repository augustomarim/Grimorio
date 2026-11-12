import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { proxyTrust } from '../src/proxy.js';
import { loadConfig } from '../src/config.js';
import { mailContent, ResendMailer } from '../src/auth/mail.js';
import { encryptArchive, decryptArchive, fileDigest } from '../src/db/backup-encryption.js';
const env = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://web.example.invalid',
  PUBLIC_API_ORIGIN: 'https://api.example.invalid',
  AUTH_KEY: 'test-only-secret-of-at-least-32-characters',
  DATABASE_URL: 'postgresql://user:secret@db.neon.tech/test',
  MAIL_MODE: 'resend',
  MAIL_FROM: 'sender@example.invalid',
  RESEND_API_KEY: 'test-no-real-key',
};
afterEach(() => vi.restoreAllMocks());
describe('Configuração final Render', () => {
  it('aceita HTTPS transacional, prefixo e proxy com limite de um hop', () => {
    const config = loadConfig({
      ...env,
      API_PREFIX: '/api',
      TRUSTED_PROXIES: '127.0.0.1,10.0.0.0/8',
    });
    expect(config).toMatchObject({
      apiPrefix: '/api',

      mailMode: 'resend',
      cookieSameSite: 'lax',
    });
  });
  it('usa URL pública automática do Render e não aceita HTTP em produção', () => {
    const base = {
      ...env,
      PUBLIC_API_ORIGIN: '',
      RENDER_EXTERNAL_URL: 'https://example.onrender.com',
    };
    expect(loadConfig(base).apiOrigin).toBe('https://example.onrender.com');
    expect(() =>
      loadConfig({ ...base, RENDER_EXTERNAL_URL: 'http://example.onrender.com' })
    ).toThrow('HTTPS');
  });
  it('recusa prefixo que possa alterar caminho ou cabeçalho de cookie', () => {
    for (const prefix of [
      '/api/',
      '//api',
      '/api?x',
      '/api;anything',
      '/../',
      'https://evil.invalid',
    ])
      expect(() => loadConfig({ ...env, API_PREFIX: prefix })).toThrow('API_PREFIX');
  });
  it('confia somente em pares permitidos e nunca em um segundo hop', () => {
    const trust = proxyTrust(['127.0.0.1', '10.0.0.0/8']);
    expect(trust).not.toBe(false);
    if (trust) {
      expect(trust('10.4.3.2', 0)).toBe(true);
      expect(trust('203.0.113.9', 0)).toBe(false);
      expect(trust('10.4.3.2', 1)).toBe(false);
    }
    for (const value of ['*', 'true', '0.0.0.0/0', '10.0.0.0/99'])
      expect(() => proxyTrust([value])).toThrow();
  });
  it('recusa SameSite=None sem HTTPS e campos de e-mail incompletos', () => {
    expect(() =>
      loadConfig({
        ...env,
        NODE_ENV: 'development',
        PUBLIC_API_ORIGIN: 'http://localhost:3000',
        COOKIE_SAME_SITE: 'none',
      })
    ).toThrow('HTTPS');
    expect(() => loadConfig({ ...env, RESEND_API_KEY: '' })).toThrow('RESEND_API_KEY');
    expect(() => loadConfig({ ...env, MAIL_FROM: 'header\r\nInjection' })).toThrow('MAIL_FROM');
  });
});
describe('E-mail transacional HTTPS, sem autenticação Google', () => {
  it('envia contrato HTTPS e mantém token apenas no fragmento do link', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"test"}', { status: 200 }));
    const settings = loadConfig(env).resend!;
    await new ResendMailer(settings, env.APP_ORIGIN).send({
      to: 'recipient@example.invalid',
      purpose: 'password_reset',
      token: 'test&token/#',
    });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error' });
    const body = JSON.parse(request!.body as string);
    expect(body.to).toEqual(['recipient@example.invalid']);
    expect(body.text).toContain('#token=');
    expect(body.text).not.toContain('?token=');
    expect((request!.headers as Record<string, string>).authorization).toBe(
      'Bearer test-no-real-key'
    );
  });
  it('não expõe corpo de erro do provedor nem credenciais', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        { message: 'You can only send testing emails to your own email address (private@example.invalid).' },
        { status: 403 }
      )
    );
    await expect(
      new ResendMailer(loadConfig(env).resend!, env.APP_ORIGIN).send({
        to: 'test@example.invalid',
        purpose: 'password_reset',
        token: 'secret-token',
      })
    ).rejects.toMatchObject({
      message: 'Falha na entrega de e-mail por HTTPS',
      reason: 'test_recipient',
      status: 403,
    });
  });
  it('produz link de redefinição com token no fragmento', () => {
    const content = mailContent(
      { to: 'test@example.invalid', purpose: 'password_reset', token: 'test-token' },
      env.APP_ORIGIN
    );
    expect(content.text).toContain('/reset-password#token=');
    expect(content.subject).toContain('redefinir');
  });
});
describe('Backup autenticado AES-256-GCM', () => {
  it('criptografa/restaura bytes e não publica arquivo ao detectar adulteração', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grimorio-enc-'));
    const source = join(dir, 'source'),
      encrypted = join(dir, 'backup.enc'),
      plain = join(dir, 'result'),
      tampered = join(dir, 'tampered');
    try {
      writeFileSync(source, Buffer.from('not a real database: private fixture'));
      const key = 'ab'.repeat(32),
        result = await encryptArchive(source, encrypted, key);
      expect(readFileSync(encrypted).includes(readFileSync(source))).toBe(false);
      expect(result.sha256).toBe((await fileDigest(encrypted)).sha256);
      await decryptArchive(encrypted, plain, key);
      expect(readFileSync(plain)).toEqual(readFileSync(source));
      const bytes = readFileSync(encrypted);
      bytes[bytes.length - 20] ^= 1;
      writeFileSync(tampered, bytes);
      const output = join(dir, 'must-not-exist');
      await expect(decryptArchive(tampered, output, key)).rejects.toThrow();
      expect(existsSync(output)).toBe(false);
      await expect(encryptArchive(source, encrypted, key)).rejects.toThrow('Destino');
      await expect(
        decryptArchive(encrypted, join(dir, 'wrong-key'), 'cd'.repeat(32))
      ).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('recusa chave fraca antes de gerar um backup', async () => {
    await expect(encryptArchive('/nonexistent', '/nonexistent', '123')).rejects.toThrow('32 bytes');
  });
});

describe('Limite de memória da autenticação', () => {
  it('admite dois hashes, limita a fila e recupera capacidade ao terminar', async () => {
    const argon2 = (await import('argon2')).default;
    const { hashPassword } = await import('../src/auth/crypto.js');
    let active = 0,
      maxActive = 0;
    const releases: (() => void)[] = [];
    const spy = vi.spyOn(argon2, 'hash').mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return 'fake-hash-for-unit-test';
    });
    const tasks = Array.from({ length: 18 }, () => hashPassword('test-password'));
    try {
      await expect(hashPassword('extra')).rejects.toMatchObject({
        statusCode: 503,
        code: 'AUTH_BUSY',
      });
      while (releases.length) {
        for (const release of releases.splice(0)) release();
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(await Promise.all(tasks)).toHaveLength(18);
      expect(maxActive).toBe(2);
    } finally {
      while (releases.length) {
        for (const release of releases.splice(0)) release();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.allSettled(tasks);
      spy.mockRestore();
    }
  });
});

describe('Snapshot do catálogo para prontidão', () => {
  it('usa a revisão realmente publicada no pacote fixado', async () => {
    const { REVISION } = await import('@freshmag/one-dndb/data');
    const { EXPECTED_REVISION } = await import('../src/catalog/version.js');
    expect(EXPECTED_REVISION).toBe(REVISION);
  });
});
