import { execFileSync } from 'node:child_process';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, copyFileSync, rmSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type Database from 'better-sqlite3';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';
import { migrate, verifyHistory } from '../src/db/migrations.js';
import { importCatalog } from '../src/catalog/import.js';
import { digest, verifyPassword } from '../src/auth/crypto.js';
import { allStates, anyStates } from '../src/rules/validation.js';
import { ACCESS, REFRESH } from '../src/routes/auth.js';
import type { Mail } from '../src/auth/mail.js';
import type { Config } from '../src/config.js';

const origin = 'http://localhost:3000',
  password = 'senha-longa-de-teste-123';
let baseDirectory: string,
  basePath: string,
  directory: string,
  app: FastifyInstance,
  db: Database.Database;
let messages: Mail[], now: Date;
function cookies(response: LightMyRequestResponse) {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
async function register(email = 'owner@example.invalid', username = 'owner') {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    headers: { origin },
    payload: { email, username, password },
  });
  expect(response.statusCode).toBe(202);
  return response;
}
async function login(email = 'owner@example.invalid') {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { origin },
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return response;
}
function localId(kind: string, slug: string) {
  return (
    db
      .prepare(
        `SELECT t.id FROM lib_${kind} t JOIN catalog_entry e ON e.id=t.catalog_entry_id WHERE e.slug=? AND e.kind=?`
      )
      .get(slug, kind) as { id: number }
  ).id;
}
function character() {
  return {
    name: 'Ari',
    systemCode: 'dnd-2024',
    attributes: {
      strength: 10,
      dexterity: 14,
      constitution: 14,
      intelligence: 16,
      wisdom: 14,
      charisma: 14,
    },
    speciesId: localId('species', 'human'),
    backgroundId: localId('background', 'criminal'),
    classes: [{ classId: localId('class', 'wizard'), level: 1, initial: true }],
    narrative: { backstory: 'Aprendiz de magia' },
  };
}
async function create(cookie: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/characters',
    headers: { origin, cookie },
    payload: character(),
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}
async function confirm(email = 'owner@example.invalid') {
  const mail = messages.findLast((m) => m.to === email && m.purpose === 'email_verification')!;
  const response = await app.inject({
    method: 'POST',
    url: '/auth/email-verification/confirm',
    headers: { origin },
    payload: { token: mail.token },
  });
  expect(response.statusCode).toBe(204);
  return mail;
}

beforeAll(async () => {
  baseDirectory = mkdtempSync(join(tmpdir(), 'grimorio-base-'));
  basePath = join(baseDirectory, 'base.db');
  const database = openDatabase(basePath);
  migrate(database);
  const result = await importCatalog(database);
  expect(result.total).toBe(1905);
  expect(result.links).toBe(4631);
  database.close();
}, 30_000);
afterAll(() => rmSync(baseDirectory, { recursive: true, force: true }));
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'grimorio-http-'));
  const path = join(directory, 'test.db');
  copyFileSync(basePath, path);
  messages = [];
  now = new Date('2030-01-01T00:00:00.000Z');
  const config: Config = {
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    databasePath: path,
    origin,
    authKey: 'test-only-secret-key-with-at-least-32-bytes',
    mailMode: 'disabled',
    mailDirectory: join(directory, 'mail'),
  };
  const built = await buildApp({
    config,
    mailer: {
      send: async (mail) => {
        messages.push(mail);
      },
    },
    now: () => now,
  });
  app = built.app;
  db = built.db;
});
afterEach(async () => {
  if (app) await app.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('Fundação e catálogo real', () => {
  it('executa migrações, saúde e não carrega usuários de exemplo', async () => {
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', schemaVersion: 4, catalogEntries: 1905 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.prepare('SELECT count(*) AS n FROM app_user').get()).toEqual({ n: 0 });
    expect(migrate(db)).toBe(4);
  });
  it('retorna indisponibilidade quando a versão do banco diverge', async () => {
    db.pragma('user_version = 99');
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SCHEMA_MISMATCH');
  });
  it('consulta catálogo paginado, detalhe e fontes sem inventar procedência', async () => {
    const response = await app.inject('/catalog/class?limit=2');
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(13);
    expect(response.json().items).toHaveLength(2);
    expect(response.json().items[0].localId).toBeTypeOf('number');
    const spell = await app.inject('/catalog/spell?q=Light');
    expect(spell.statusCode).toBe(200);
    const light = spell.json().items.find((x: { slug: string }) => x.slug === 'light');
    const detail = await app.inject(`/catalog/spell/${light.id}`);
    expect(detail.json().details.data.id).toBe('light');
    expect(detail.json().sources).toEqual([]);
    expect((await app.inject(`/catalog/class/${light.id}`)).statusCode).toBe(404);
    expect((await app.inject('/catalog/item?limit=101')).statusCode).toBe(400);
    expect((await app.inject('/catalog/item?q=%25')).json().total).toBe(0);
  });
  it('reimporta sem duplicar ids nem apagar curadoria ou fichas', async () => {
    await register();
    const response = await login();
    const sheet = await create(cookies(response));
    const entry = db
      .prepare("SELECT id FROM catalog_entry WHERE kind='spell' AND slug='light'")
      .get() as { id: number };
    const book = db.prepare('SELECT id FROM rules_source LIMIT 1').get() as { id: number };
    db.prepare('INSERT INTO catalog_entry_source VALUES(?,?)').run(entry.id, book.id);
    const result = await importCatalog(db);
    expect(result.total).toBe(1905);
    expect(result.deprecated).toBe(0);
    expect(
      db.prepare("SELECT id FROM catalog_entry WHERE kind='spell' AND slug='light'").get()
    ).toEqual(entry);
    expect(
      db
        .prepare(
          'SELECT 1 AS ok FROM catalog_entry_source WHERE catalog_entry_id=? AND source_id=?'
        )
        .get(entry.id, book.id)
    ).toEqual({ ok: 1 });
    expect(
      (await app.inject({ url: `/characters/${sheet.id}`, headers: { cookie: cookies(response) } }))
        .statusCode
    ).toBe(200);
  }, 15_000);
  it('rejeita migração alterada e reverte DDL de migração com falha', () => {
    const copy = join(directory, 'migrations');
    cpSync(join(process.cwd(), 'migrations'), copy, { recursive: true });
    writeFileSync(
      join(copy, '0005_test.sql'),
      'CREATE TABLE should_rollback(id INTEGER);\nINSERT INTO missing_table VALUES(1);\n'
    );
    expect(() => migrate(db, copy)).toThrow();
    expect(verifyHistory(db)).toBe(4);
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE name='should_rollback'").get()
    ).toBeUndefined();
    writeFileSync(
      join(copy, '0001_initial.sql'),
      readFileSync(join(copy, '0001_initial.sql'), 'utf8') + '\n-- changed\n'
    );
    expect(() => migrate(db, copy)).toThrow(/checksum/);
  });
});

describe('Autenticação HTTP real', () => {
  it('responde 400 para JSON vazio ou inválido sem ecoar o conteúdo', async () => {
    for (const payload of ['', '{"password":"private-test-marker",']) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        headers: { origin, 'content-type': 'application/json' },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_JSON');
      expect(response.body).not.toContain('private-test-marker');
    }
    expect(db.prepare('SELECT count(*) AS n FROM app_user').get()).toEqual({ n: 0 });
  });
  it('preserva os códigos de mídia não suportada e corpo excessivo', async () => {
    const media = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin, 'content-type': 'application/xml' },
      payload: '<test />',
    });
    expect(media.statusCode).toBe(415);
    expect(media.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    const large = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin, 'content-type': 'application/json' },
      payload: JSON.stringify({ value: 'x'.repeat(128 * 1024) }),
    });
    expect(large.statusCode).toBe(413);
    expect(large.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
  it('mantém erros inesperados sanitizados e fornece identificador para diagnóstico', async () => {
    db.exec('ALTER TABLE app_user RENAME TO unavailable_user');
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { origin },
      payload: {
        email: 'test@example.invalid',
        username: 'tester',
        password: 'private-test-marker-123',
      },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
    expect(response.json().error.requestId).toBeTypeOf('string');
    expect(response.body).not.toContain('private-test-marker');
    expect(response.body).not.toContain('no such table');
  });

  it('exige origem permitida e rejeita campos extras', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'x@example.invalid', password },
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          headers: { origin: 'https://evil.invalid' },
          payload: { email: 'x@example.invalid', username: 'xxx', password },
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          headers: { origin },
          payload: { email: 'x@example.invalid', username: 'xxx', password, role: 'admin' },
        })
      ).statusCode
    ).toBe(400);
  });
  it('permite preflight só da origem configurada e marca dados privados como não cacheáveis', async () => {
    const ok = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(origin);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: { origin: 'https://evil.invalid', 'access-control-request-method': 'POST' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('protege senha com Argon2id, usa cookies e não expõe tokens no JSON', async () => {
    await register();
    const duplicate = await register();
    expect(duplicate.statusCode).toBe(202);
    const row = db.prepare('SELECT password_hash,role FROM app_user').get() as {
      password_hash: string;
      role: string;
    };
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(row.password_hash, password)).toBe(true);
    expect(row.role).toBe('user');
    const response = await login();
    expect(response.json().access).toBeUndefined();
    expect(response.json().refresh).toBeUndefined();
    expect(response.json().user.password_hash).toBeUndefined();
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('SameSite=Lax'),
      ])
    );
    const session = db.prepare('SELECT token_hash FROM session').get() as { token_hash: string };
    expect(session.token_hash).toBe(digest(response.cookies.find((c) => c.name === ACCESS)!.value));
    const me = await app.inject({ url: '/auth/me', headers: { cookie: cookies(response) } });
    expect(me.json().user.email).toBe('owner@example.invalid');
    expect(me.headers['cache-control']).toContain('no-store');
  });
  it('limita tentativas conhecidas e desconhecidas sem revelar a conta', async () => {
    await register();
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin },
      payload: { email: 'owner@example.invalid', password: 'wrong' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin },
      payload: { email: 'unknown@example.invalid', password: 'wrong' },
    });
    expect(wrong.json()).toEqual(unknown.json());
    for (let i = 1; i < 5; i++)
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { origin },
        payload: { email: 'owner@example.invalid', password: 'wrong' },
      });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          headers: { origin },
          payload: { email: 'owner@example.invalid', password },
        })
      ).statusCode
    ).toBe(401);
    now = new Date(now.getTime() + 16 * 60_000);
    expect((await login()).statusCode).toBe(200);
  }, 15_000);
  it('rotaciona tokens e confirma revogação por replay sem afetar outra sessão', async () => {
    await register();
    const first = await login(),
      second = await login();
    const rotated = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin, cookie: cookies(first) },
    });
    expect(rotated.statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/auth/me', headers: { cookie: cookies(first) } })).statusCode
    ).toBe(401);
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin, cookie: cookies(first) },
    });
    expect(replay.statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/auth/me', headers: { cookie: cookies(rotated) } })).statusCode
    ).toBe(401);
    expect(
      (await app.inject({ url: '/auth/me', headers: { cookie: cookies(second) } })).statusCode
    ).toBe(200);
    expect(
      (
        db
          .prepare("SELECT count(*) AS n FROM audit_log WHERE action='session.refresh_reuse'")
          .get() as { n: number }
      ).n
    ).toBe(1);
  });
  it('expira access, permite refresh antes do limite e bloqueia usuário inativo', async () => {
    await register();
    const first = await login();
    now = new Date(now.getTime() + 16 * 60_000);
    expect(
      (await app.inject({ url: '/auth/me', headers: { cookie: cookies(first) } })).statusCode
    ).toBe(401);
    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin, cookie: cookies(first) },
    });
    expect(refreshed.statusCode).toBe(200);
    db.prepare('UPDATE app_user SET is_active=0').run();
    expect(
      (await app.inject({ url: '/auth/me', headers: { cookie: cookies(refreshed) } })).statusCode
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: { origin, cookie: cookies(refreshed) },
        })
      ).statusCode
    ).toBe(401);
  });
  it('confirma e-mail uma vez e troca senha revogando todas as sessões', async () => {
    await register();
    const mail = await confirm();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/email-verification/confirm',
          headers: { origin },
          payload: { token: mail.token },
        })
      ).statusCode
    ).toBe(400);
    const first = await login(),
      second = await login();
    const known = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: { origin },
      payload: { email: 'owner@example.invalid' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      headers: { origin },
      payload: { email: 'unknown@example.invalid' },
    });
    expect(known.json()).toEqual(unknown.json());
    const reset = messages.findLast((m) => m.purpose === 'password_reset')!;
    const changed = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      headers: { origin },
      payload: { token: reset.token, password: 'nova-senha-muito-longa-123' },
    });
    expect(changed.statusCode).toBe(204);
    for (const session of [first, second])
      expect(
        (await app.inject({ url: '/auth/me', headers: { cookie: cookies(session) } })).statusCode
      ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/password-reset/confirm',
          headers: { origin },
          payload: { token: reset.token, password },
        })
      ).statusCode
    ).toBe(400);
    const row = db.prepare('SELECT password_hash FROM app_user').get() as { password_hash: string };
    expect(await verifyPassword(row.password_hash, 'nova-senha-muito-longa-123')).toBe(true);
  });
  it('promove administrador somente pelo utilitário local e reflete o papel na sessão existente', async () => {
    await register();
    const session = await login();
    const result = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'src/auth/admin-cli.ts', 'owner@example.invalid'],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test', DATABASE_PATH: join(directory, 'test.db') },
        encoding: 'utf8',
      }
    );
    expect(JSON.parse(result).role).toBe('admin');
    const me = await app.inject({ url: '/auth/me', headers: { cookie: cookies(session) } });
    expect(me.json().user.role).toBe('admin');
    expect(
      db.prepare("SELECT count(*) AS n FROM audit_log WHERE action='account.promote_admin'").get()
    ).toEqual({ n: 1 });
  });
  it('logout limpa cookies e revoga a família', async () => {
    await register();
    const first = await login();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { origin, cookie: cookies(first) },
    });
    expect(response.statusCode).toBe(204);
    expect(response.cookies.every((c) => c.value === '')).toBe(true);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: { origin, cookie: cookies(first) },
        })
      ).statusCode
    ).toBe(401);
  });
});

describe('Fichas, permissões e multiclasse estrutural', () => {
  it('cria ficha privada com PV, edita narrativa e apaga sem tocar no catálogo', async () => {
    await register();
    const session = await login(),
      cookie = cookies(session),
      sheet = await create(cookie);
    expect(sheet.total_level).toBe(1);
    expect(sheet.hitPoints.base_hit_points).toBe(8);
    expect(sheet.validation.rulesVerified).toBe(false);
    expect((await app.inject(`/characters/${sheet.id}`)).statusCode).toBe(404);
    const update = await app.inject({
      method: 'PATCH',
      url: `/characters/${sheet.id}`,
      headers: { origin, cookie },
      payload: { name: 'Ari editado', narrative: { goals: 'Aprender' } },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().narrative.backstory).toBe('Aprendiz de magia');
    expect(update.json().narrative.goals).toBe('Aprender');
    expect(
      (await app.inject({ url: '/characters/mine?q=Ari', headers: { cookie } })).json().total
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${sheet.id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(db.prepare('SELECT count(*) AS n FROM character_class').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM catalog_entry').get()).toEqual({ n: 1905 });
  });
  it('impede acesso de outro dono, exige confirmação e respeita moderação', async () => {
    await register();
    const owner = await login(),
      cookie = cookies(owner),
      sheet = await create(cookie);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${sheet.id}/publish`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(403);
    await confirm();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${sheet.id}/publish`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect((await app.inject(`/characters/${sheet.id}`)).statusCode).toBe(200);
    expect((await app.inject('/characters/public')).json().total).toBe(1);
    await register('other@example.invalid', 'other');
    const other = await login('other@example.invalid');
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${sheet.id}`,
          headers: { origin, cookie: cookies(other) },
          payload: { name: 'forbidden' },
        })
      ).statusCode
    ).toBe(404);
    db.prepare("UPDATE app_user SET role='admin' WHERE email='other@example.invalid'").run();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/admin/characters/${sheet.id}/hide`,
          headers: { origin, cookie: cookies(other) },
        })
      ).statusCode
    ).toBe(204);
    expect((await app.inject(`/characters/${sheet.id}`)).statusCode).toBe(404);
    expect(
      (await app.inject({ url: `/characters/${sheet.id}`, headers: { cookie: cookies(other) } }))
        .statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${sheet.id}/publish`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(403);
  });
  it('persiste 3/4/3=10 e rejeita histórico inválido e soma acima de 20 atomicamente', async () => {
    await register();
    const session = await login(),
      cookie = cookies(session),
      input = character();
    const ids = [
      localId('class', 'wizard'),
      localId('class', 'cleric'),
      localId('class', 'sorcerer'),
    ];
    const classes = ids.map((classId, index) => ({
      classId,
      level: [3, 4, 3][index]!,
      initial: index === 0,
    }));
    const progression = classes.flatMap((c, index) =>
      Array.from({ length: c.level }, (_, level) => ({
        classId: c.classId,
        hpMethod: index === 0 && level === 0 ? 'first_max' : 'average',
      }))
    );
    const response = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: { ...input, classes, progression },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().total_level).toBe(10);
    expect(response.json().hitPoints.base_hit_points).toBe(66);
    const bad = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...input,
        classes: [
          { classId: ids[0], level: 20, initial: true },
          { classId: ids[1], level: 1, initial: false },
        ],
      },
    });
    expect(bad.statusCode).toBe(400);
    expect((db.prepare('SELECT count(*) AS n FROM character').get() as { n: number }).n).toBe(1);
    const update = await app.inject({
      method: 'PATCH',
      url: `/characters/${response.json().id}`,
      headers: { origin, cookie },
      payload: { classes },
    });
    expect(update.statusCode).toBe(400);
    expect(
      (await app.inject({ url: `/characters/${response.json().id}`, headers: { cookie } })).json()
        .total_level
    ).toBe(10);
  });
  it('rejeita opções depreciadas e subclasse de outra classe', async () => {
    await register();
    const session = await login(),
      cookie = cookies(session),
      input = character();
    const sub = db
      .prepare('SELECT id FROM lib_subclass WHERE class_id!=? LIMIT 1')
      .get(input.classes[0]!.classId) as { id: number };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/characters',
          headers: { origin, cookie },
          payload: { ...input, classes: [{ ...input.classes[0], subclassId: sub.id }] },
        })
      ).statusCode
    ).toBe(400);
    db.prepare(
      "UPDATE catalog_entry SET deprecated_at='2030-01-01T00:00:00.000Z' WHERE kind='species' AND slug='human'"
    ).run();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/characters',
          headers: { origin, cookie },
          payload: input,
        })
      ).statusCode
    ).toBe(400);
    expect((db.prepare('SELECT count(*) AS n FROM character').get() as { n: number }).n).toBe(0);
  });
});

describe('Inventário HTTP', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    return { cookie, sheet, itemId: localId('item', 'dagger') };
  }
  async function add(characterId: number, cookie: string, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/characters/${characterId}/items`,
      headers: { origin, cookie },
      payload: body,
    });
  }
  it('adiciona item real com defaults, dados do catálogo e fontes', async () => {
    const { cookie, sheet, itemId } = await setup();
    const catalog = db.prepare('SELECT catalog_entry_id FROM lib_item WHERE id=?').get(itemId) as {
      catalog_entry_id: number;
    };
    const book = db.prepare('SELECT id FROM rules_source LIMIT 1').get() as { id: number };
    db.prepare('INSERT INTO catalog_entry_source VALUES(?,?)').run(
      catalog.catalog_entry_id,
      book.id
    );
    const result = await add(sheet.id, cookie, { itemId });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({
      characterId: sheet.id,
      quantity: 1,
      equipped: false,
      notes: null,
      item: { id: itemId, slug: 'dagger', kind: 'weapon', deprecatedAt: null },
    });
    expect(result.json().item.sources[0].id).toBe(book.id);
    const detail = await app.inject({
      url: `/characters/${sheet.id}/items/${result.json().id}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual(result.json());
  });
  it('mantém duas instâncias independentes do mesmo item e preserva campos omitidos', async () => {
    const { cookie, sheet, itemId } = await setup();
    const first = await add(sheet.id, cookie, {
        itemId,
        quantity: 2,
        equipped: true,
        notes: 'Adaga principal',
      }),
      second = await add(sheet.id, cookie, { itemId, notes: 'Reserva' });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().id).not.toBe(second.json().id);
    const changed = await app.inject({
      method: 'PATCH',
      url: `/characters/${sheet.id}/items/${first.json().id}`,
      headers: { origin, cookie },
      payload: { quantity: 3, equipped: false },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({
      quantity: 3,
      equipped: false,
      notes: 'Adaga principal',
    });
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/characters/${sheet.id}/items/${first.json().id}`,
      headers: { origin, cookie },
      payload: { notes: null },
    });
    expect(cleared.json().notes).toBeNull();
    const untouched = await app.inject({
      url: `/characters/${sheet.id}/items/${second.json().id}`,
      headers: { cookie },
    });
    expect(untouched.json()).toMatchObject({ quantity: 1, equipped: false, notes: 'Reserva' });
  });
  it('pagina e filtra equipados, não equipados e nome literal', async () => {
    const { cookie, sheet, itemId } = await setup();
    await add(sheet.id, cookie, { itemId, equipped: true });
    await add(sheet.id, cookie, { itemId });
    const list = await app.inject({
      url: `/characters/${sheet.id}/items?limit=1&page=2`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(list.json().items).toHaveLength(1);
    for (const equipped of ['true', 'false']) {
      const filtered = await app.inject({
        url: `/characters/${sheet.id}/items?equipped=${equipped}&q=Dagger`,
        headers: { cookie },
      });
      expect(filtered.json().total).toBe(1);
      expect(filtered.json().items[0].equipped).toBe(equipped === 'true');
    }
    expect(
      (await app.inject({ url: `/characters/${sheet.id}/items?q=%25`, headers: { cookie } })).json()
        .total
    ).toBe(0);
    expect(
      (await app.inject({ url: `/characters/${sheet.id}/items?limit=101`, headers: { cookie } }))
        .statusCode
    ).toBe(400);
  });
  it('rejeita quantidades inválidas, item inexistente e campos não permitidos sem gravação', async () => {
    const { cookie, sheet, itemId } = await setup();
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect((await add(sheet.id, cookie, { itemId, quantity })).statusCode).toBe(400);
    expect((await add(sheet.id, cookie, { itemId: 99999999 })).statusCode).toBe(400);
    expect((await add(sheet.id, cookie, { itemId, ownerId: 1 })).statusCode).toBe(400);
    expect((await add(sheet.id, cookie, { itemId, notes: 'x'.repeat(10001) })).statusCode).toBe(
      400
    );
    expect(db.prepare('SELECT count(*) AS n FROM character_item').get()).toEqual({ n: 0 });
  });
  it('PATCH não permite trocar catálogo, zerar quantidade ou enviar alteração vazia', async () => {
    const { cookie, sheet, itemId } = await setup();
    const row = await add(sheet.id, cookie, { itemId, quantity: 2, notes: 'Preservar' });
    for (const body of [{ quantity: 0 }, { itemId }, {}]) {
      const result = await app.inject({
        method: 'PATCH',
        url: `/characters/${sheet.id}/items/${row.json().id}`,
        headers: { origin, cookie },
        payload: body,
      });
      expect(result.statusCode).toBe(400);
    }
    const current = await app.inject({
      url: `/characters/${sheet.id}/items/${row.json().id}`,
      headers: { cookie },
    });
    expect(current.json()).toMatchObject({ quantity: 2, notes: 'Preservar' });
  });
  it('protege inventário privado e exige sessão nas alterações', async () => {
    const { cookie, sheet, itemId } = await setup();
    const row = await add(sheet.id, cookie, { itemId });
    expect((await app.inject(`/characters/${sheet.id}/items`)).statusCode).toBe(404);
    expect((await app.inject(`/characters/${sheet.id}/items/${row.json().id}`)).statusCode).toBe(
      404
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${sheet.id}/items`,
          headers: { origin },
          payload: { itemId },
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${sheet.id}/items/${row.json().id}`,
          headers: { origin },
        })
      ).statusCode
    ).toBe(401);
  });
  it('outro dono não edita e administrador pode apenas consultar', async () => {
    const { cookie, sheet, itemId } = await setup();
    const row = await add(sheet.id, cookie, { itemId });
    await register('reader@example.invalid', 'reader');
    const other = cookies(await login('reader@example.invalid'));
    expect(
      (await app.inject({ url: `/characters/${sheet.id}/items`, headers: { cookie: other } }))
        .statusCode
    ).toBe(404);
    for (const method of ['PATCH', 'DELETE'] as const)
      expect(
        (
          await app.inject({
            method,
            url: `/characters/${sheet.id}/items/${row.json().id}`,
            headers: { origin, cookie: other },
            ...(method === 'PATCH' ? { payload: { quantity: 2 } } : {}),
          })
        ).statusCode
      ).toBe(404);
    db.prepare("UPDATE app_user SET role='admin' WHERE email='reader@example.invalid'").run();
    expect(
      (await app.inject({ url: `/characters/${sheet.id}/items`, headers: { cookie: other } }))
        .statusCode
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${sheet.id}/items`,
          headers: { origin, cookie: other },
          payload: { itemId },
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${sheet.id}/items/${row.json().id}`,
          headers: { origin, cookie: other },
        })
      ).statusCode
    ).toBe(404);
  });
  it('publicação e moderação da ficha controlam também a leitura do inventário', async () => {
    const { cookie, sheet, itemId } = await setup();
    await add(sheet.id, cookie, { itemId, notes: 'Observação pública da ficha' });
    await confirm();
    await app.inject({
      method: 'POST',
      url: `/characters/${sheet.id}/publish`,
      headers: { origin, cookie },
    });
    const list = await app.inject(`/characters/${sheet.id}/items`);
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0].notes).toBe('Observação pública da ficha');
    db.prepare(
      "UPDATE character SET publication_blocked_at='2030-01-01T00:00:00.000Z' WHERE id=?"
    ).run(sheet.id);
    expect((await app.inject(`/characters/${sheet.id}/items`)).statusCode).toBe(404);
    expect(
      (await app.inject({ url: `/characters/${sheet.id}/items`, headers: { cookie } })).statusCode
    ).toBe(200);
  });
  it('não usa uma instância de outra ficha mesmo quando o usuário é dono das duas', async () => {
    const { cookie, sheet, itemId } = await setup();
    const otherSheet = await create(cookie),
      row = await add(sheet.id, cookie, { itemId });
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const result = await app.inject({
        method,
        url: `/characters/${otherSheet.id}/items/${row.json().id}`,
        headers: { origin, cookie },
        ...(method === 'PATCH' ? { payload: { quantity: 5 } } : {}),
      });
      expect(result.statusCode).toBe(404);
    }
    expect(
      (
        await app.inject({
          url: `/characters/${sheet.id}/items/${row.json().id}`,
          headers: { cookie },
        })
      ).statusCode
    ).toBe(200);
  });
  it('preserva itens depreciados, permite notas/uso/redução e rejeita novas aquisições', async () => {
    const { cookie, sheet, itemId } = await setup();
    const row = await add(sheet.id, cookie, { itemId, quantity: 3 });
    db.prepare(
      "UPDATE catalog_entry SET deprecated_at='2030-01-01T00:00:00.000Z' WHERE id=(SELECT catalog_entry_id FROM lib_item WHERE id=?)"
    ).run(itemId);
    const added = await add(sheet.id, cookie, { itemId });
    expect(added.statusCode).toBe(400);
    expect(added.json().error.code).toBe('ITEM_DEPRECATED');
    const increased = await app.inject({
      method: 'PATCH',
      url: `/characters/${sheet.id}/items/${row.json().id}`,
      headers: { origin, cookie },
      payload: { quantity: 4 },
    });
    expect(increased.statusCode).toBe(400);
    const changed = await app.inject({
      method: 'PATCH',
      url: `/characters/${sheet.id}/items/${row.json().id}`,
      headers: { origin, cookie },
      payload: { quantity: 2, equipped: true, notes: 'Item antigo preservado' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().item.deprecatedAt).not.toBeNull();
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${sheet.id}/items/${row.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(db.prepare('SELECT id FROM lib_item WHERE id=?').get(itemId)).toBeDefined();
  });
  it('audita e atualiza a ficha/revisão, removendo só a instância escolhida', async () => {
    const { cookie, sheet, itemId } = await setup();
    db.prepare("UPDATE character SET updated_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(
      sheet.id
    );
    const revision = db
      .prepare(
        "INSERT INTO ruleset_revision(revision,library_version) VALUES('test-inventory-revision','test-only')"
      )
      .run().lastInsertRowid;
    const first = await add(sheet.id, cookie, { itemId }),
      second = await add(sheet.id, cookie, { itemId });
    expect(
      (
        db.prepare('SELECT updated_at FROM character WHERE id=?').get(sheet.id) as {
          updated_at: string;
        }
      ).updated_at
    ).not.toBe('2000-01-01T00:00:00.000Z');
    expect(
      db
        .prepare('SELECT ruleset_revision_id AS id FROM dnd_character WHERE character_id=?')
        .get(sheet.id)
    ).toEqual({ id: Number(revision) });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${sheet.id}/items/${first.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(
      (
        await app.inject({
          url: `/characters/${sheet.id}/items/${second.json().id}`,
          headers: { cookie },
        })
      ).statusCode
    ).toBe(200);
    const audit = db
      .prepare("SELECT details FROM audit_log WHERE action='inventory.remove' AND entity_id=?")
      .get(first.json().id) as { details: string };
    expect(JSON.parse(audit.details)).toMatchObject({ characterId: sheet.id, itemId });
  });
  it('reverte item e data da ficha se a auditoria falhar', async () => {
    const { cookie, sheet, itemId } = await setup();
    db.prepare("UPDATE character SET updated_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(
      sheet.id
    );
    db.exec('DROP TABLE audit_log'); // Falha interna simulada somente no banco temporário.
    const result = await add(sheet.id, cookie, { itemId });
    expect(result.statusCode).toBe(500);
    expect(db.prepare('SELECT count(*) AS n FROM character_item').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT updated_at FROM character WHERE id=?').get(sheet.id)).toEqual({
      updated_at: '2000-01-01T00:00:00.000Z',
    });
  });
  it('excluir ficha remove suas instâncias sem afetar o catálogo', async () => {
    const { cookie, sheet, itemId } = await setup();
    await add(sheet.id, cookie, { itemId, quantity: 5 });
    await add(sheet.id, cookie, { itemId });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${sheet.id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(db.prepare('SELECT count(*) AS n FROM character_item').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT id FROM lib_item WHERE id=?').get(itemId)).toBeDefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('não aplica inventário D&D a uma identidade de outro sistema', async () => {
    await register();
    const session = await login(),
      cookie = cookies(session),
      userId = session.json().user.id;
    db.prepare(
      "INSERT INTO rpg_system(id,code,name,edition) VALUES(99,'future-test','Sistema de teste','test')"
    ).run();
    db.prepare(
      "INSERT INTO character(id,owner_id,system_id,name) VALUES(99,?,99,'Outra ficha')"
    ).run(userId);
    expect((await add(99, cookie, { itemId: localId('item', 'dagger') })).statusCode).toBe(409);
    expect(
      (await app.inject({ url: '/characters/99/items', headers: { cookie } })).statusCode
    ).toBe(409);
    expect((await app.inject('/characters/99/items')).statusCode).toBe(404);
  });
});

describe('Benefícios com origem', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(sheet.id) as {
      id: number;
    };
    const response = await app.inject({
      method: 'POST',
      url: `/characters/${sheet.id}/grants`,
      headers: { origin, cookie },
      payload: {
        originKind: 'class',
        originId: cc.id,
        acquisitionContext: 'initial_class',
        ruleKey: 'wizard.skills',
        acquiredAtLevel: 1,
      },
    });
    expect(response.statusCode).toBe(201);
    return { cookie, id: sheet.id, grantId: response.json().id };
  }
  it('registra quatro tipos, preserva fontes, especialização e alterações', async () => {
    const { cookie, id, grantId } = await setup();
    for (const kind of ['feat', 'tool', 'language', 'skill']) {
      const entry = db.prepare(`SELECT id FROM lib_${kind} LIMIT 1`).get() as { id: number };
      const response = await app.inject({
        method: 'POST',
        url: `/characters/${id}/benefits`,
        headers: { origin, cookie },
        payload: {
          kind,
          localId: entry.id,
          grantId,
          selectionKind: 'chosen',
          choiceKey: `wizard.${kind}`,
          ...(kind === 'skill' || kind === 'tool' ? { proficiencyRank: 2 } : {}),
        },
      });
      expect(response.statusCode).toBe(201);
      const instanceId = response.json().id;
      const patch = await app.inject({
        method: 'PATCH',
        url: `/characters/${id}/benefits/${kind}/${instanceId}`,
        headers: { origin, cookie },
        payload: { notes: 'Escolhido', ...(kind === 'skill' ? { proficiencyRank: 1 } : {}) },
      });
      expect(patch.statusCode).toBe(200);
    }
    const response = await app.inject({ url: `/characters/${id}/benefits`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(4);
    expect(response.json().skills[0].proficiencyRank).toBe(1);
    expect(response.json().validation.rulesVerified).toBe(false);
    for (const row of response.json().items) {
      expect(Array.isArray(row.sources)).toBe(true);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/characters/${id}/benefits/${row.kind}/${row.id}`,
            headers: { origin, cookie },
          })
        ).statusCode
      ).toBe(204);
    }
    expect(
      (await app.inject({ url: `/characters/${id}/benefits`, headers: { cookie } })).json().items
    ).toHaveLength(0);
  });
  it('recusa concessão de outro personagem, seleção inválida e graduação indevida', async () => {
    const { cookie, id, grantId } = await setup();
    const other = await create(cookie);
    const feat = db.prepare('SELECT id FROM lib_feat LIMIT 1').get() as { id: number };
    const payload = { kind: 'feat', localId: feat.id, grantId, selectionKind: 'fixed' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${other.id}/benefits`,
          headers: { origin, cookie },
          payload,
        })
      ).statusCode
    ).toBe(400);
    for (const extra of [
      { selectionKind: 'chosen' },
      { proficiencyRank: 2 },
      { choiceKey: 'unexpected' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/characters/${id}/benefits`,
            headers: { origin, cookie },
            payload: { ...payload, ...extra },
          })
        ).statusCode
      ).toBe(400);
    expect((await app.inject({ url: `/characters/${id}/benefits` })).statusCode).toBe(404);
  });
  it('impede escrita de outro dono e rollback quando auditoria falha', async () => {
    const { cookie, id, grantId } = await setup();
    await register('other@example.invalid', 'other');
    const outsider = cookies(await login('other@example.invalid'));
    const entry = db.prepare('SELECT id FROM lib_language LIMIT 1').get() as { id: number };
    const payload = { kind: 'language', localId: entry.id, grantId, selectionKind: 'fixed' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${id}/benefits`,
          headers: { origin, cookie: outsider },
          payload,
        })
      ).statusCode
    ).toBe(404);
    db.exec(
      "CREATE TRIGGER reject_benefit_audit BEFORE INSERT ON audit_log WHEN NEW.action='benefit.add' BEGIN SELECT RAISE(ABORT,'audit failed'); END"
    );
    const response = await app.inject({
      method: 'POST',
      url: `/characters/${id}/benefits`,
      headers: { origin, cookie },
      payload,
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_ability WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
  });
  it('resume a maior graduação e remove descendentes de um talento sem apagar o catálogo', async () => {
    const { cookie, id, grantId } = await setup();
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { origin, cookie }, payload });
    const skill = db.prepare('SELECT id FROM lib_skill LIMIT 1').get() as { id: number };
    const skillPayload = {
      kind: 'skill',
      localId: skill.id,
      grantId,
      selectionKind: 'fixed',
      proficiencyRank: 1,
    };
    expect((await post(`/characters/${id}/benefits`, skillPayload)).statusCode).toBe(201);
    expect((await post(`/characters/${id}/benefits`, skillPayload)).statusCode).toBe(400);
    const feat = db.prepare('SELECT id FROM lib_feat LIMIT 1').get() as { id: number };
    const featResponse = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: feat.id,
      grantId,
      selectionKind: 'fixed',
    });
    expect(featResponse.statusCode).toBe(201);
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: featResponse.json().id,
      acquisitionContext: 'feat',
      ruleKey: 'feat.expertise',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/benefits`, {
          ...skillPayload,
          grantId: grant.json().id,
          proficiencyRank: 2,
        })
      ).statusCode
    ).toBe(201);
    expect(
      (await app.inject({ url: `/characters/${id}/benefits`, headers: { cookie } })).json()
        .skills[0].proficiencyRank
    ).toBe(2);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/benefits/feat/${featResponse.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(
      (await app.inject({ url: `/characters/${id}/benefits`, headers: { cookie } })).json()
        .skills[0].proficiencyRank
    ).toBe(1);
    expect(db.prepare('SELECT 1 FROM lib_feat WHERE id=?').get(feat.id)).toBeTruthy();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('Magias e grimório', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(sheet.id) as {
      id: number;
    };
    const spell = db.prepare('SELECT id FROM lib_spell WHERE level=1 LIMIT 1').get() as {
      id: number;
    };
    const cantrip = db.prepare('SELECT id FROM lib_spell WHERE level=0 LIMIT 1').get() as {
      id: number;
    };
    const payload = {
      spellId: spell.id,
      originKind: 'class',
      originId: cc.id,
      preparationMode: 'selectable',
    };
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { origin, cookie }, payload });
    return { cookie, id: sheet.id, cc: cc.id, spell: spell.id, cantrip: cantrip.id, payload, post };
  }
  it('mantém grimório independente, prepara e desmarca sem apagar catálogo', async () => {
    const { cookie, id, cc, spell, payload, post } = await setup();
    const book = await post(`/characters/${id}/spellbook`, {
      spellId: spell,
      characterClassId: cc,
    });
    expect(book.statusCode).toBe(201);
    expect(
      (await post(`/characters/${id}/spellbook`, { spellId: spell, characterClassId: cc }))
        .statusCode
    ).toBe(400);
    const added = await post(`/characters/${id}/spells`, payload);
    expect(added.statusCode).toBe(201);
    const instance = added.json().id;
    expect((await post(`/characters/${id}/spells`, payload)).statusCode).toBe(400);
    for (const prepared of [true, false]) {
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/characters/${id}/spells/${instance}`,
            headers: { origin, cookie },
            payload: { isPrepared: prepared, notes: null, castingAbilityChoice: 'intelligence' },
          })
        ).statusCode
      ).toBe(200);
      const list = (
        await app.inject({ url: `/characters/${id}/spells`, headers: { cookie } })
      ).json();
      expect(list.items[0].effectivePrepared).toBe(prepared);
      expect(Array.isArray(list.items[0].sources)).toBe(true);
      expect(list.validation.rulesVerified).toBe(false);
    }
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/spellbook/${book.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(
      (await app.inject({ url: `/characters/${id}/spells`, headers: { cookie } })).json().total
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/spells/${instance}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(db.prepare('SELECT 1 FROM lib_spell WHERE id=?').get(spell)).toBeTruthy();
  });
  it('distingue truques e sempre preparadas e permite a mesma magia por outra origem', async () => {
    const { cookie, id, cantrip, payload, post } = await setup();
    expect(
      (await post(`/characters/${id}/spells`, { ...payload, spellId: cantrip })).statusCode
    ).toBe(400);
    expect(
      (await post(`/characters/${id}/spells`, { ...payload, preparationMode: 'cantrip' }))
        .statusCode
    ).toBe(400);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...payload,
          preparationMode: 'always_prepared',
          isPrepared: true,
        })
      ).statusCode
    ).toBe(400);
    const always = await post(`/characters/${id}/spells`, {
      ...payload,
      preparationMode: 'always_prepared',
    });
    expect(always.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}/spells/${always.json().id}`,
          headers: { origin, cookie },
          payload: { isPrepared: false },
        })
      ).statusCode
    ).toBe(400);
    expect(
      (await app.inject({ url: `/characters/${id}/spells`, headers: { cookie } })).json().items[0]
        .effectivePrepared
    ).toBe(true);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...payload,
          spellId: cantrip,
          preparationMode: 'cantrip',
        })
      ).statusCode
    ).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...payload,
          originKind: 'species',
          originId: localId('species', 'human'),
        })
      ).statusCode
    ).toBe(201);
  });
  it('isola origens e instâncias entre personagens e recusa acesso de outro dono', async () => {
    const { cookie, id, payload, post, spell, cc, cantrip } = await setup();
    const other = await create(cookie);
    expect((await post(`/characters/${other.id}/spells`, payload)).statusCode).toBe(400);
    expect(
      (await post(`/characters/${other.id}/spellbook`, { spellId: spell, characterClassId: cc }))
        .statusCode
    ).toBe(400);
    expect(
      (await post(`/characters/${id}/spellbook`, { spellId: cantrip, characterClassId: cc }))
        .statusCode
    ).toBe(400);
    const added = await post(`/characters/${id}/spells`, payload);
    expect(added.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${other.id}/spells/${added.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(404);
    expect((await app.inject({ url: `/characters/${id}/spells` })).statusCode).toBe(404);
    await register('reader@example.invalid', 'reader');
    const outsider = cookies(await login('reader@example.invalid'));
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}/spells/${added.json().id}`,
          headers: { origin, cookie: outsider },
          payload: { notes: 'changed' },
        })
      ).statusCode
    ).toBe(404);
    expect(
      (await app.inject({ url: `/characters/${id}/spellbook`, headers: { cookie: outsider } }))
        .statusCode
    ).toBe(404);
  });
  it('bloqueia novas aquisições depreciadas e reverte quando auditoria falha', async () => {
    const { id, payload, post, spell } = await setup();
    db.prepare(
      "UPDATE catalog_entry SET deprecated_at='2030-01-01T00:00:00Z' WHERE id=(SELECT catalog_entry_id FROM lib_spell WHERE id=?)"
    ).run(spell);
    expect((await post(`/characters/${id}/spells`, payload)).statusCode).toBe(400);
    db.prepare(
      'UPDATE catalog_entry SET deprecated_at=NULL WHERE id=(SELECT catalog_entry_id FROM lib_spell WHERE id=?)'
    ).run(spell);
    db.exec(
      "CREATE TRIGGER reject_spell_audit BEFORE INSERT ON audit_log WHEN NEW.action='spell.add' BEGIN SELECT RAISE(ABORT,'audit failed'); END"
    );
    expect((await post(`/characters/${id}/spells`, payload)).statusCode).toBe(400);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spell WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('Auditoria das regras disponíveis no catálogo', () => {
  it('combina cláusulas E/OU sem tratar desconhecido como aprovado', () => {
    expect(allStates(['pass', 'unknown'])).toBe('unknown');
    expect(allStates(['fail', 'unknown'])).toBe('fail');
    expect(anyStates(['pass', 'unknown'])).toBe('pass');
    expect(anyStates(['fail', 'unknown'])).toBe('unknown');
    expect(anyStates(['fail', 'fail'])).toBe('fail');
    expect(allStates([])).toBe('pass');
    expect(anyStates([])).toBe('fail');
  });
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(sheet.id) as {
      id: number;
    };
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { origin, cookie }, payload });
    const report = async () => {
      const response = await app.inject({
        url: `/characters/${sheet.id}/validation`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      return response.json();
    };
    return { id: sheet.id, cookie, cc: cc.id, post, report };
  }
  it('identifica magia fora da lista, nível excessivo e ausência no grimório sem alterar a ficha', async () => {
    const { id, cc, post, report } = await setup();
    const spellId = localId('spell', 'cure-wounds');
    expect(
      (
        await post(`/characters/${id}/spells`, {
          spellId,
          originKind: 'class',
          originId: cc,
          preparationMode: 'selectable',
          isPrepared: true,
        })
      ).statusCode
    ).toBe(201);
    const high = localId('spell', 'wish');
    expect(
      (await post(`/characters/${id}/spellbook`, { spellId: high, characterClassId: cc }))
        .statusCode
    ).toBe(201);
    const before = db.prepare('SELECT * FROM character WHERE id=?').get(id);
    const result = await report();
    for (const code of ['CLASS_SPELL_LIST', 'WIZARD_PREPARED_IN_BOOK', 'SPELLBOOK_ENTRY'])
      expect(
        result.findings.some(
          (f: { code: string; state: string }) => f.code === code && f.state === 'fail'
        )
      ).toBe(true);
    expect(result.rulesVerified).toBe(false);
    expect(result.summary.unknown).toBeGreaterThan(0);
    expect(db.prepare('SELECT * FROM character WHERE id=?').get(id)).toEqual(before);
  });
  it('usa nível individual, conta apenas preparação manual e verifica truques', async () => {
    const { id, cc, post, report } = await setup();
    const wizardSpells = db
      .prepare(
        "SELECT id FROM lib_spell WHERE level=1 AND EXISTS(SELECT 1 FROM json_each(data,'$.classes') WHERE value='wizard') LIMIT 5"
      )
      .all() as { id: number }[];
    for (const spell of wizardSpells) {
      expect(
        (await post(`/characters/${id}/spellbook`, { spellId: spell.id, characterClassId: cc }))
          .statusCode
      ).toBe(201);
      expect(
        (
          await post(`/characters/${id}/spells`, {
            spellId: spell.id,
            originKind: 'class',
            originId: cc,
            preparationMode: 'selectable',
            isPrepared: true,
          })
        ).statusCode
      ).toBe(201);
    }
    let result = await report();
    expect(
      result.findings.find((f: { code: string }) => f.code === 'CLASS_PREPARED_LIMIT').state
    ).toBe('fail');
    const row = db
      .prepare('SELECT id FROM character_spell WHERE character_id=? LIMIT 1')
      .get(id) as { id: number };
    db.prepare(
      "UPDATE character_spell SET preparation_mode='always_prepared',is_prepared=0 WHERE id=?"
    ).run(row.id);
    result = await report();
    expect(
      result.findings.find((f: { code: string }) => f.code === 'CLASS_PREPARED_LIMIT').state
    ).toBe('pass');
    expect(
      result.findings
        .filter((f: { code: string }) => f.code === 'CLASS_SPELL_LIST')
        .every((f: { state: string }) => f.state === 'pass')
    ).toBe(true);
    expect(
      result.findings.find((f: { code: string }) => f.code === 'CLASS_CANTRIP_LIMIT').evidence
        .maximum
    ).toBe(3);
  });
  it('avalia pré-requisito de nível e E/OU de talentos reais e mantém campanha inconclusiva', async () => {
    const { id, cc, post, report } = await setup();
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc,
      acquisitionContext: 'initial_class',
      ruleKey: 'test.feats',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    for (const slug of ['war-caster', 'aberrant-anatomy'])
      expect(
        (
          await post(`/characters/${id}/benefits`, {
            kind: 'feat',
            localId: localId('feat', slug),
            grantId: grant.json().id,
            selectionKind: 'fixed',
          })
        ).statusCode
      ).toBe(201);
    let result = await report();
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { slug: string } }) =>
          f.code === 'FEAT_PREREQUISITES' && f.evidence?.slug === 'war-caster'
      ).state
    ).toBe('fail');
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { slug: string } }) =>
          f.code === 'FEAT_PREREQUISITES' && f.evidence?.slug === 'aberrant-anatomy'
      ).state
    ).toBe('unknown');
    db.prepare('UPDATE character_class SET level=4 WHERE id=?').run(cc);
    result = await report();
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { slug: string } }) =>
          f.code === 'FEAT_PREREQUISITES' && f.evidence?.slug === 'war-caster'
      ).state
    ).toBe('pass');
  });
  it('protege fichas privadas e não certifica ficha sem achados negativos', async () => {
    const { id, report } = await setup();
    expect((await app.inject({ url: `/characters/${id}/validation` })).statusCode).toBe(404);
    await register('audit@example.invalid', 'auditor');
    const stranger = cookies(await login('audit@example.invalid'));
    expect(
      (await app.inject({ url: `/characters/${id}/validation`, headers: { cookie: stranger } }))
        .statusCode
    ).toBe(404);
    const result = await report();
    expect(result.summary.failed).toBe(0);
    expect(result.rulesVerified).toBe(false);
    expect(result.basis.catalogRevision.library_version).toBe('0.5.1');
  });
});

describe('Escolhas de benefícios extraídas do pacote', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(sheet.id) as {
      id: number;
    };
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { origin, cookie }, payload });
    const grant = await post(`/characters/${sheet.id}/grants`, {
      originKind: 'class',
      originId: cc.id,
      acquisitionContext: 'initial_class',
      ruleKey: 'wizard.training.first',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    const report = async () => {
      const response = await app.inject({
        url: `/characters/${sheet.id}/validation`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      return response.json();
    };
    const skill = async (slug: string, key: string, rank = 1, grantId = grant.json().id) => {
      const response = await post(`/characters/${sheet.id}/benefits`, {
        kind: 'skill',
        localId: localId('skill', `skill-${slug}`),
        grantId,
        selectionKind: 'chosen',
        choiceKey: key,
        proficiencyRank: rank,
      });
      expect(response.statusCode).toBe(201);
      return response.json().id;
    };
    return { cookie, id: sheet.id, cc: cc.id, post, grantId: grant.json().id, report, skill };
  }
  it('expõe as escolhas reais e reconhece opções válidas e inválidas do mago', async () => {
    const { id, cookie, skill, report } = await setup();
    const options = await app.inject({
      url: `/characters/${id}/benefits/options`,
      headers: { cookie },
    });
    expect(options.statusCode).toBe(200);
    const training = options
      .json()
      .items.find((x: { choiceKey: string }) => x.choiceKey === 'skillChoices:training');
    expect(training.rule.pick).toBe(2);
    expect(training.rule.from).toContain('Arcana');
    const scholar = options
      .json()
      .items.find((x: { choiceKey: string }) => x.choiceKey === 'expertise:scholar');
    expect(scholar.available).toBe(false);
    const valid = await skill('arcana', 'skillChoices:training');
    const invalid = await skill('athletics', 'skillChoices:training');
    const result = await report();
    expect(
      result.findings.find(
        (f: { code: string; entityId: number }) =>
          f.code === 'BENEFIT_CHOICE_OPTION' && f.entityId === valid
      ).state
    ).toBe('pass');
    expect(
      result.findings.find(
        (f: { code: string; entityId: number }) =>
          f.code === 'BENEFIT_CHOICE_OPTION' && f.entityId === invalid
      ).state
    ).toBe('fail');
    expect((await app.inject({ url: `/characters/${id}/benefits/options` })).statusCode).toBe(404);
  });
  it('soma escolhas entre concessões da mesma classe sem multiplicar o limite', async () => {
    const { id, cc, post, skill, report } = await setup();
    await skill('arcana', 'skillChoices:training');
    await skill('history', 'skillChoices:training');
    const second = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc,
      acquisitionContext: 'initial_class',
      ruleKey: 'wizard.training.second',
      acquiredAtLevel: 1,
    });
    expect(second.statusCode).toBe(201);
    await skill('religion', 'skillChoices:training', 1, second.json().id);
    const limit = (await report()).findings.find(
      (f: { code: string }) => f.code === 'BENEFIT_CHOICE_LIMIT'
    );
    expect(limit.state).toBe('fail');
    expect(limit.evidence.selected).toBe(3);
    expect(limit.evidence.maximum).toBe(2);
  });
  it('confere nível de Scholar e deixa chave antiga inconclusiva', async () => {
    const { id, cc, post, skill, report } = await setup();
    await skill('arcana', 'skillChoices:training');
    const expertiseGrant = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc,
      acquisitionContext: 'class_progression',
      ruleKey: 'wizard.scholar',
      acquiredAtLevel: 1,
    });
    expect(expertiseGrant.statusCode).toBe(201);
    const expert = await skill('arcana', 'expertise:scholar', 2, expertiseGrant.json().id);
    const legacy = await skill('history', 'wizard.initial.skill.1');
    let result = await report();
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { choiceKey: string } }) =>
          f.code === 'BENEFIT_CHOICE_LEVEL' && f.evidence?.choiceKey === 'expertise:scholar'
      ).state
    ).toBe('fail');
    expect(
      result.findings.find(
        (f: { code: string; entityId: number }) =>
          f.code === 'BENEFIT_CHOICE_MAPPING' && f.entityId === legacy
      ).state
    ).toBe('unknown');
    db.prepare('UPDATE character_class SET level=2 WHERE id=?').run(cc);
    result = await report();
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { choiceKey: string } }) =>
          f.code === 'BENEFIT_CHOICE_LEVEL' && f.evidence?.choiceKey === 'expertise:scholar'
      ).state
    ).toBe('pass');
    expect(
      result.findings.find(
        (f: { code: string; entityId: number }) =>
          f.code === 'BENEFIT_CHOICE_OPTION' && f.entityId === expert
      ).state
    ).toBe('pass');
  });
  it('conta conjuntamente perícias e ferramentas de Skilled', async () => {
    const { id, post, grantId, skill, report } = await setup();
    const feat = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: localId('feat', 'skilled'),
      grantId,
      selectionKind: 'fixed',
    });
    expect(feat.statusCode).toBe(201);
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: feat.json().id,
      acquisitionContext: 'feat',
      ruleKey: 'skilled.picks',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    for (const slug of ['arcana', 'history', 'religion'])
      await skill(slug, 'toolChoices:benefit-1', 1, grant.json().id);
    const tool = db.prepare('SELECT id FROM lib_tool LIMIT 1').get() as { id: number };
    expect(
      (
        await post(`/characters/${id}/benefits`, {
          kind: 'tool',
          localId: tool.id,
          grantId: grant.json().id,
          selectionKind: 'chosen',
          choiceKey: 'toolChoices:benefit-1',
          proficiencyRank: 1,
        })
      ).statusCode
    ).toBe(201);
    const result = await report();
    const limit = result.findings.find(
      (f: { code: string; evidence?: { choiceKey: string } }) =>
        f.code === 'BENEFIT_CHOICE_LIMIT' && f.evidence?.choiceKey === 'toolChoices:benefit-1'
    );
    expect(limit.state).toBe('fail');
    expect(limit.evidence.selected).toBe(4);
    expect(limit.evidence.maximum).toBe(3);
    expect(
      result.findings
        .filter((f: { code: string }) => f.code === 'BENEFIT_CHOICE_OPTION')
        .every((f: { state: string }) => f.state === 'pass')
    ).toBe(true);
  });
  it('respeita grupos de ferramentas e o acesso a idiomas raros', async () => {
    const { id, post, grantId, report } = await setup();
    const background = localId('background', 'artisan');
    db.prepare('UPDATE dnd_character SET background_id=? WHERE character_id=?').run(background, id);
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'background',
      originId: background,
      acquisitionContext: 'background',
      ruleKey: 'artisan.tool',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    for (const group of ['artisan', 'gaming']) {
      const tool = db
        .prepare(
          'SELECT t.id FROM lib_tool t JOIN lib_tool_group g ON g.id=t.group_id JOIN catalog_entry e ON e.id=g.catalog_entry_id WHERE e.slug=? LIMIT 1'
        )
        .get(group) as { id: number };
      expect(
        (
          await post(`/characters/${id}/benefits`, {
            kind: 'tool',
            localId: tool.id,
            grantId: grant.json().id,
            selectionKind: 'chosen',
            choiceKey: 'toolChoices:tool',
            proficiencyRank: 1,
          })
        ).statusCode
      ).toBe(201);
    }
    const feat = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: localId('feat', 'echoing-soul'),
      grantId,
      selectionKind: 'fixed',
    });
    expect(feat.statusCode).toBe(201);
    const languageGrant = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: feat.json().id,
      acquisitionContext: 'feat',
      ruleKey: 'echoing.languages',
      acquiredAtLevel: 1,
    });
    expect(languageGrant.statusCode).toBe(201);
    for (const tier of ['common', 'rare']) {
      const language = db
        .prepare('SELECT id FROM lib_language WHERE tier=? AND is_always=0 LIMIT 1')
        .get(tier) as { id: number };
      expect(
        (
          await post(`/characters/${id}/benefits`, {
            kind: 'language',
            localId: language.id,
            grantId: languageGrant.json().id,
            selectionKind: 'chosen',
            choiceKey: 'languageChoices:inherent-tongues',
          })
        ).statusCode
      ).toBe(201);
    }
    const result = await report();
    for (const key of ['toolChoices:tool', 'languageChoices:inherent-tongues']) {
      const matches = result.findings.filter(
        (f: { code: string; evidence?: { choiceKey: string } }) =>
          f.code === 'BENEFIT_CHOICE_OPTION' && f.evidence?.choiceKey === key
      );
      expect(matches.map((f: { state: string }) => f.state)).toEqual(['pass', 'fail']);
    }
  });
});

describe('Escolhas aninhadas e migração 4', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const payload = { ...character(), speciesId: localId('species', 'elf') };
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'species',
      originId: payload.speciesId,
      acquisitionContext: 'species',
      ruleKey: 'elf.lineage',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    return { id, cookie, post, grantId: grant.json().id, speciesId: payload.speciesId };
  }
  it('salva linhagem real, expõe suas magias e impede multiplicar a escolha', async () => {
    const { id, cookie, post, grantId, speciesId } = await setup();
    const selected = await post(`/characters/${id}/choices`, {
      grantId,
      choiceId: 'lineage',
      optionId: 'drow',
    });
    expect(selected.statusCode).toBe(201);
    const second = await post(`/characters/${id}/grants`, {
      originKind: 'species',
      originId: speciesId,
      acquisitionContext: 'species',
      ruleKey: 'elf.lineage.second',
      acquiredAtLevel: 1,
    });
    expect(second.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/choices`, {
          grantId: second.json().id,
          choiceId: 'lineage',
          optionId: 'high-elf',
        })
      ).statusCode
    ).toBe(400);
    const list = await app.inject({ url: `/characters/${id}/choices`, headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().selected).toHaveLength(1);
    const option = list.json().options[0].options.find((x: { id: string }) => x.id === 'drow');
    expect(option.spellsFixed.map((x: { id: string }) => x.id)).toContain('faerie-fire');
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/choices/${selected.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(
      (
        await post(`/characters/${id}/choices`, {
          grantId,
          choiceId: 'lineage',
          optionId: 'high-elf',
        })
      ).statusCode
    ).toBe(201);
  });
  it('audita magia de linhagem prematura e reconhece a liberada sem criar magias automaticamente', async () => {
    const { id, cookie, post, grantId, speciesId } = await setup();
    expect(
      (await post(`/characters/${id}/choices`, { grantId, choiceId: 'lineage', optionId: 'drow' }))
        .statusCode
    ).toBe(201);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spell WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    for (const [slug, mode] of [
      ['dancing-lights', 'cantrip'],
      ['faerie-fire', 'always_prepared'],
    ])
      expect(
        (
          await post(`/characters/${id}/spells`, {
            spellId: localId('spell', slug!),
            originKind: 'species',
            originId: speciesId,
            preparationMode: mode,
          })
        ).statusCode
      ).toBe(201);
    const result = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { spell: string } }) =>
          f.code === 'NESTED_FIXED_SPELL' && f.evidence?.spell === 'dancing-lights'
      ).state
    ).toBe('pass');
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { spell: string } }) =>
          f.code === 'NESTED_FIXED_SPELL' && f.evidence?.spell === 'faerie-fire'
      ).state
    ).toBe('fail');
    expect(result.rulesVerified).toBe(false);
  });
  it('isola origem e instância, recusa ids inventados e reverte falha de auditoria', async () => {
    const { id, cookie, post, grantId } = await setup();
    const other = await create(cookie);
    const payload = { grantId, choiceId: 'lineage', optionId: 'drow' };
    expect((await post(`/characters/${other.id}/choices`, payload)).statusCode).toBe(400);
    expect(
      (await post(`/characters/${id}/choices`, { ...payload, optionId: 'invented' })).statusCode
    ).toBe(400);
    expect((await app.inject({ url: `/characters/${id}/choices` })).statusCode).toBe(404);
    db.exec(
      "CREATE TRIGGER reject_choice_audit BEFORE INSERT ON audit_log WHEN NEW.action='choice.add' BEGIN SELECT RAISE(ABORT,'audit failed'); END"
    );
    expect((await post(`/characters/${id}/choices`, payload)).statusCode).toBe(400);
    expect(db.prepare('SELECT count(*) AS n FROM character_choice').get()).toEqual({ n: 0 });
    db.exec('DROP TRIGGER reject_choice_audit');
    const selected = await post(`/characters/${id}/choices`, payload);
    expect(selected.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${other.id}/choices/${selected.json().id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(db.prepare('SELECT count(*) AS n FROM character_choice').get()).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('recusa escolha antes do nível e expõe escolhas de magias ainda inconclusivas', async () => {
    const { id, cookie, post } = await setup();
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(id) as {
      id: number;
    };
    db.prepare('UPDATE character_class SET class_id=? WHERE id=?').run(
      localId('class', 'ranger'),
      cc.id
    );
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc.id,
      acquisitionContext: 'initial_class',
      ruleKey: 'ranger.style',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    const payload = {
      grantId: grant.json().id,
      choiceId: 'fighting-style',
      optionId: 'druidic-warrior',
    };
    expect((await post(`/characters/${id}/choices`, payload)).statusCode).toBe(400);
    db.prepare('UPDATE character_class SET level=2 WHERE id=?').run(cc.id);
    expect((await post(`/characters/${id}/choices`, payload)).statusCode).toBe(201);
    const result = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      result.findings.find((f: { code: string }) => f.code === 'NESTED_SPELL_CHOICES').state
    ).toBe('unknown');
  });
});
