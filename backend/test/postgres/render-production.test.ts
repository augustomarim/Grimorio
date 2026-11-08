import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { openDatabase, type Database } from '../../src/db/database.js';
import { migrate } from '../../src/db/migrations.js';
import { importCatalog } from '../../src/catalog/import.js';
import { buildApp } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/config.js';
import { bucketHash, digest } from '../../src/auth/crypto.js';
import type { Mail } from '../../src/auth/mail.js';
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const schema = 'production_' + randomUUID().replaceAll('-', '');
const origin = 'https://app.example.invalid';
const password = 'test-password-longer-than-12';
let config: Config;
let connection: string,
  admin: Database,
  db: Database,
  app: FastifyInstance,
  messages: Mail[],
  now: Date;
const headers = { origin };
const cookies = (r: LightMyRequestResponse) =>
  r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
async function post(
  path: string,
  payload: unknown,
  cookie?: string,
  extra: Record<string, string> = {}
) {
  return app.inject({
    method: 'POST',
    url: '/api' + path,
    headers: { ...headers, ...(cookie ? { cookie } : {}), ...extra },
    payload,
  });
}
async function account(email = 'owner@example.invalid', username = 'owner') {
  expect((await post('/auth/register', { email, username, password })).statusCode).toBe(202);
  const login = await post('/auth/login', { email, password });
  expect(login.statusCode, login.body).toBe(200);
  return { cookie: cookies(login), response: login, email };
}
async function local(kind: string, slug: string) {
  return (
    await db
      .prepare(
        `SELECT l.id FROM lib_${kind} l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE e.slug=? AND e.kind=?`
      )
      .get(slug, kind)
  ).id as number;
}
async function character(cookie: string) {
  const r = await post(
    '/characters',
    {
      name: 'Ficha privada',
      systemCode: 'dnd-2024',
      attributes: {
        strength: 10,
        dexterity: 14,
        constitution: 14,
        intelligence: 16,
        wisdom: 14,
        charisma: 14,
      },
      speciesId: await local('species', 'human'),
      classes: [{ classId: await local('class', 'wizard'), level: 1, initial: true }],
    },
    cookie
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as number;
}
suite('Homologação de produção: HTTPS, prefixo e conta própria', () => {
  beforeAll(async () => {
    admin = openDatabase(url!);
    await admin.exec('CREATE SCHEMA ' + schema);
    const target = new URL(url!);
    target.searchParams.set('options', '-c search_path=' + schema + ',public');
    connection = target.toString();
    const seed = openDatabase(connection);
    try {
      await migrate(seed);
      await importCatalog(seed);
    } finally {
      await seed.close();
    }
  });
  beforeEach(async () => {
    db = openDatabase(connection);
    await db.exec('TRUNCATE app_user,login_throttle CASCADE');
    messages = [];
    now = new Date('2030-01-01T00:00:00Z');
    config = loadConfig({
      NODE_ENV: 'production',
      APP_ORIGIN: origin,
      PUBLIC_API_ORIGIN: 'https://api.example.invalid',
      DATABASE_URL: 'postgresql://test:secret@example.neon.tech/test',
      AUTH_KEY: 'test-only-production-secret-at-least-32',
      API_PREFIX: '/api',
      TRUSTED_PROXIES: '127.0.0.1,10.0.0.0/8',
      MAIL_MODE: 'resend',
      RESEND_API_KEY: 'test-only-no-real-key',
      MAIL_FROM: 'sender@example.invalid',
    });
    const built = await buildApp({
      config,
      database: db,
      mailer: {
        send: async (mail) => {
          messages.push(mail);
        },
      },
      now: () => now,
    });
    app = built.app;
  });
  afterEach(async () => {
    if (app) await app.close();
  });
  afterAll(async () => {
    if (admin) {
      await admin.exec('DROP SCHEMA ' + schema + ' CASCADE');
      await admin.close();
    }
  });
  it('mantém liveness sem consulta e readiness com catálogo', async () => {
    expect((await app.inject('/live')).json()).toEqual({ status: 'alive' });
    const r = await app.inject('/health');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().catalogEntries).toBe(1905);
    expect((await app.inject('/auth/me')).statusCode).toBe(404);
  });

  it('não consulta o banco no liveness e sanitiza indisponibilidade no readiness', async () => {
    const spy = vi
      .spyOn(db, 'query')
      .mockRejectedValue(
        Object.assign(new Error('do-not-expose-connection-details'), { code: '08006' })
      );
    try {
      const live = await app.inject('/live');
      expect(live.statusCode).toBe(200);
      expect(spy).not.toHaveBeenCalled();
      const health = await app.inject('/health');
      expect(health.statusCode).toBe(503);
      expect(health.headers['retry-after']).toBe('5');
      expect(health.body).not.toContain('do-not-expose');
    } finally {
      spy.mockRestore();
    }
  });
  it('não cria tabelas implicitamente quando falta migração em produção', async () => {
    const empty = 'empty_' + randomUUID().replaceAll('-', '');
    await admin.exec('CREATE SCHEMA ' + empty);
    const target = new URL(connection);
    target.searchParams.set('options', '-c search_path=' + empty);
    const other = openDatabase(target.toString());
    try {
      await expect(
        buildApp({ config, database: other, mailer: { send: async () => {} } })
      ).rejects.toThrow('db:migrate');
      expect(
        (await admin.prepare('SELECT count(*) n FROM pg_tables WHERE schemaname=?').get(empty)).n
      ).toBe(0);
    } finally {
      if (other.open) await other.close();
      await admin.exec('DROP SCHEMA ' + empty + ' CASCADE');
    }
  });
  it('não inicia produção com catálogo vazio nem insere dados para mascarar a ausência', async () => {
    const empty = 'empty_' + randomUUID().replaceAll('-', '');
    await admin.exec('CREATE SCHEMA ' + empty);
    const target = new URL(connection);
    target.searchParams.set('options', '-c search_path=' + empty + ',' + schema + ',public');
    const other = openDatabase(target.toString());
    try {
      await migrate(other);
      await expect(
        buildApp({ config, database: other, mailer: { send: async () => {} } })
      ).rejects.toThrow('Catálogo incompleto');
      expect((await admin.prepare('SELECT count(*) n FROM ' + empty + '.rpg_system').get()).n).toBe(
        0
      );
    } finally {
      if (other.open) await other.close();
      await admin.exec('DROP SCHEMA ' + empty + ' CASCADE');
    }
  });
  it('emite cookies Secure/HttpOnly host-only com caminhos do proxy /api', async () => {
    const a = await account();
    const access = a.response.cookies.find((c) => c.name === 'grimorio_access')!,
      refresh = a.response.cookies.find((c) => c.name === 'grimorio_refresh')!;
    expect(access).toMatchObject({ path: '/api', httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(refresh).toMatchObject({
      path: '/api/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
    expect(access.domain).toBeUndefined();
    expect(refresh.domain).toBeUndefined();
    expect(a.response.json()).not.toHaveProperty('access');
    expect(a.response.json()).not.toHaveProperty('refresh');
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: a.cookie } })).statusCode
    ).toBe(200);
  });
  it('permite somente a origem configurada, inclusive no preflight', async () => {
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.headers['access-control-allow-origin']).toBe(origin);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    const denied = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.invalid' },
      payload: { email: 'owner@example.invalid', password },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'owner@example.invalid', password },
        })
      ).statusCode
    ).toBe(403);
  });
  it('não aceita papel ou propriedades de conta extras no cadastro', async () => {
    const r = await post('/auth/register', {
      email: 'owner@example.invalid',
      username: 'owner',
      password,
      role: 'admin',
    });
    expect(r.statusCode).toBe(400);
    expect((await db.prepare('SELECT count(*) n FROM app_user').get()).n).toBe(0);
  });
  it('não armazena tokens brutos e limpa os mesmos caminhos no logout', async () => {
    const a = await account();
    const access = a.response.cookies.find((c) => c.name === 'grimorio_access')!.value;
    const row = await db.prepare('SELECT token_hash FROM session LIMIT 1').get();
    expect(row.token_hash).toBe(digest(access));
    expect(row.token_hash).not.toBe(access);
    const r = await post('/auth/logout', {}, a.cookie);
    expect(r.statusCode).toBe(204);
    expect(r.cookies.map((c) => c.path).sort()).toEqual(['/api', '/api/auth']);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: a.cookie } })).statusCode
    ).toBe(401);
  });
  it('respostas sensíveis e erros não são armazenados em cache', async () => {
    const a = await account();
    const r = await app.inject({ url: '/api/auth/me', headers: { cookie: a.cookie } });
    expect(r.headers['cache-control']).toContain('no-store');
    const missing = await app.inject('/api/not-found?token=do-not-echo');
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain('do-not-echo');
  });
  it('confirma e-mail uma vez e impede publicação antes da confirmação', async () => {
    const a = await account(),
      id = await character(a.cookie);
    expect((await post(`/characters/${id}/publish`, {}, a.cookie)).statusCode).toBe(403);
    const token = messages.find((m) => m.purpose === 'email_verification')!.token;
    expect((await post('/auth/email-verification/confirm', { token })).statusCode).toBe(204);
    expect((await post('/auth/email-verification/confirm', { token })).statusCode).toBe(400);
    expect((await post(`/characters/${id}/publish`, {}, a.cookie)).statusCode).toBe(204);
  });
  it('recupera senha, revoga todas as sessões e impede reutilizar reset', async () => {
    const a = await account();
    const b = await post('/auth/login', { email: a.email, password });
    const oldB = cookies(b);
    expect((await post('/auth/password-reset/request', { email: a.email })).statusCode).toBe(202);
    const token = messages.find((m) => m.purpose === 'password_reset')!.token;
    const newPassword = 'new-test-password-123456';
    expect(
      (await post('/auth/password-reset/confirm', { token, password: newPassword })).statusCode
    ).toBe(204);
    for (const cookie of [a.cookie, oldB])
      expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
    expect(
      (await post('/auth/password-reset/confirm', { token, password: newPassword })).statusCode
    ).toBe(400);
    expect((await post('/auth/login', { email: a.email, password })).statusCode).toBe(401);
    expect((await post('/auth/login', { email: a.email, password: newPassword })).statusCode).toBe(
      200
    );
  });
  it('mantém resposta genérica para recuperação de conta inexistente', async () => {
    const a = await account();
    const known = await post('/auth/password-reset/request', { email: a.email }),
      unknown = await post('/auth/password-reset/request', { email: 'unknown@example.invalid' });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(unknown.json()).toEqual(known.json());
  });
  it('recusa tokens expirados e protege logout global', async () => {
    const a = await account();
    const token = messages[0]!.token;
    now = new Date('2030-01-03T00:00:00Z');
    expect((await post('/auth/email-verification/confirm', { token })).statusCode).toBe(400);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: a.cookie } })).statusCode
    ).toBe(401);
    const login = await post('/auth/login', { email: a.email, password }),
      cookie = cookies(login);
    expect((await post('/auth/logout-all', {}, cookie)).statusCode).toBe(204);
    expect((await post('/auth/refresh', {}, cookie)).statusCode).toBe(401);
  });
  it('limita tentativas de senha mesmo após trocar o IP', async () => {
    const a = await account();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await post('/auth/login', { email: a.email, password: 'wrong-password' }, undefined, {
            'x-forwarded-for': `192.0.2.${i + 1}`,
          })
        ).statusCode
      ).toBe(401);
    expect(
      (
        await post('/auth/login', { email: a.email, password }, undefined, {
          'x-forwarded-for': '198.51.100.1',
        })
      ).statusCode
    ).toBe(401);
    now = new Date('2030-01-01T00:16:00Z');
    expect((await post('/auth/login', { email: a.email, password })).statusCode).toBe(200);
  });
  it('confia em um hop do proxy e ignora IP forjado à esquerda', async () => {
    const response = await post(
      '/auth/login',
      { email: 'unknown@example.invalid', password },
      undefined,
      {
        'x-forwarded-for': '203.0.113.99, 198.51.100.42',
      }
    );
    expect(response.statusCode, response.body).toBe(401);
    expect(
      await db
        .prepare("SELECT 1 FROM login_throttle WHERE scope='network' AND key_hash=?")
        .get(bucketHash('test-only-production-secret-at-least-32', 'network', '198.51.100.42'))
    ).toBeDefined();
    expect(
      await db
        .prepare("SELECT 1 FROM login_throttle WHERE scope='network' AND key_hash=?")
        .get(bucketHash('test-only-production-secret-at-least-32', 'network', '203.0.113.99'))
    ).toBeUndefined();
  });

  it('ignora forwarded-for quando o par imediato não é autorizado', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '203.0.113.9',
      headers: { origin, 'x-forwarded-for': '198.51.100.42' },
      payload: { email: 'unknown@example.invalid', password },
    });
    expect(r.statusCode).toBe(401);
    expect(
      await db
        .prepare("SELECT 1 FROM login_throttle WHERE scope='network' AND key_hash=?")
        .get(bucketHash(config.authKey, 'network', '203.0.113.9'))
    ).toBeDefined();
    expect(
      await db
        .prepare("SELECT 1 FROM login_throttle WHERE scope='network' AND key_hash=?")
        .get(bucketHash(config.authKey, 'network', '198.51.100.42'))
    ).toBeUndefined();
  });
  it('não deixa outra conta ler ou editar uma ficha privada', async () => {
    const owner = await account(),
      id = await character(owner.cookie),
      other = await account('other@example.invalid', 'other');
    for (const suffix of ['', '/items', '/spells', '/derived', '/effects'])
      expect(
        (
          await app.inject({
            url: `/api/characters/${id}${suffix}`,
            headers: { cookie: other.cookie },
          })
        ).statusCode
      ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/characters/${id}`,
          headers: { origin, cookie: other.cookie },
          payload: { name: 'stolen' },
        })
      ).statusCode
    ).toBe(404);
  });
  it('admin lê e modera, mas não edita personagem alheio', async () => {
    const owner = await account(),
      id = await character(owner.cookie);
    await post('/auth/email-verification/confirm', { token: messages[0]!.token });
    await post(`/characters/${id}/publish`, {}, owner.cookie);
    const admin = await account('admin@example.invalid', 'administrator');
    await db.prepare("UPDATE app_user SET role='admin' WHERE email=?").run(admin.email);
    expect(
      (await app.inject({ url: `/api/characters/${id}`, headers: { cookie: admin.cookie } }))
        .statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/characters/${id}`,
          headers: { origin, cookie: admin.cookie },
          payload: { name: 'admin edit' },
        })
      ).statusCode
    ).toBe(404);
    expect((await post(`/admin/characters/${id}/hide`, {}, admin.cookie)).statusCode).toBe(204);
    expect((await app.inject(`/api/characters/${id}`)).statusCode).toBe(404);
    expect((await post(`/characters/${id}/publish`, {}, owner.cookie)).statusCode).toBe(403);
  });
  it('conta bloqueada perde acesso e refresh imediatamente', async () => {
    const a = await account();
    await db.prepare('UPDATE app_user SET is_active=0 WHERE email=?').run(a.email);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: a.cookie } })).statusCode
    ).toBe(401);
    expect((await post('/auth/refresh', {}, a.cookie)).statusCode).toBe(401);
  });
  it('bloqueia excesso de pedidos de recuperação', async () => {
    for (let i = 0; i < 3; i++)
      expect(
        (await post('/auth/password-reset/request', { email: 'unknown@example.invalid' }))
          .statusCode
      ).toBe(202);
    expect(
      (await post('/auth/password-reset/request', { email: 'unknown@example.invalid' })).statusCode
    ).toBe(429);
  });
});
