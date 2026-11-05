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
    expect(response.json()).toMatchObject({ status: 'ok', schemaVersion: 6, catalogEntries: 1905 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.prepare('SELECT count(*) AS n FROM app_user').get()).toEqual({ n: 0 });
    expect(migrate(db)).toBe(6);
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
      join(copy, '0007_test.sql'),
      'CREATE TABLE should_rollback(id INTEGER);\nINSERT INTO missing_table VALUES(1);\n'
    );
    expect(() => migrate(db, copy)).toThrow();
    expect(verifyHistory(db)).toBe(6);
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
    const removalPreview = await post(
      `/characters/${id}/benefits/feat/${featResponse.json().id}/removal-preview`,
      {}
    );
    expect(removalPreview.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/benefits/feat/${featResponse.json().id}?confirmationToken=${removalPreview.json().confirmationToken}`,
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
  it('reavalia multiclasse após editar atributos e classes, sem bloquear ficha parcial', async () => {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const wizard = localId('class', 'wizard');
    const paladin = localId('class', 'paladin');
    const patch = async (payload: unknown) => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/characters/${sheet.id}`,
        headers: { origin, cookie },
        payload,
      });
      expect(response.statusCode).toBe(200);
    };
    const state = async () => {
      const response = await app.inject({
        url: `/characters/${sheet.id}/validation`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().rulesVerified).toBe(false);
      return response
        .json()
        .findings.find((f: { code: string }) => f.code === 'MULTICLASS_REQUIREMENTS').state;
    };
    await patch({
      classes: [
        { classId: wizard, level: 1, initial: true },
        { classId: paladin, level: 1, initial: false },
      ],
      progression: [
        { classId: wizard, hpMethod: 'first_max' },
        { classId: paladin, hpMethod: 'average' },
      ],
    });
    expect(await state()).toBe('fail');
    await patch({ attributes: { ...character().attributes, strength: 13 } });
    expect(await state()).toBe('pass');
    await patch({ attributes: { ...character().attributes, strength: 13, intelligence: 12 } });
    expect(await state()).toBe('fail');
    await patch({
      classes: [{ classId: wizard, level: 1, initial: true }],
      progression: [{ classId: wizard, hpMethod: 'first_max' }],
    });
    expect(await state()).toBe('pass');
  });
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
  it('não presume a opção de origem de magias legadas sem vínculo explícito', async () => {
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
    ).toBe('unknown');
    expect(
      result.findings.find(
        (f: { code: string; evidence?: { spell: string } }) =>
          f.code === 'NESTED_FIXED_SPELL' && f.evidence?.spell === 'faerie-fire'
      ).state
    ).toBe('unknown');
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

describe('Capacidades de conjuração e contexto de benefícios', () => {
  it('expõe a tabela da classe inicial com acesso privado e nenhuma mutação', async () => {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const before = db.prepare('SELECT * FROM character WHERE id=?').get(sheet.id);
    const casting = await app.inject({
      url: `/characters/${sheet.id}/casting`,
      headers: { cookie },
    });
    expect(casting.statusCode).toBe(200);
    expect(casting.json().common.state).toBe('known');
    expect(casting.json().common.slots[0]).toEqual({ level: 1, maximum: 2 });
    expect(casting.json().pact).toEqual([]);
    expect(casting.json().tracksRemaining).toBe(false);
    const benefits = await app.inject({
      url: `/characters/${sheet.id}/class-benefits`,
      headers: { cookie },
    });
    expect(benefits.statusCode).toBe(200);
    expect(benefits.json().items[0].benefits.savingThrows).toEqual(['Intelligence', 'Wisdom']);
    for (const path of ['casting', 'class-benefits'])
      expect((await app.inject({ url: `/characters/${sheet.id}/${path}` })).statusCode).toBe(404);
    expect(db.prepare('SELECT * FROM character WHERE id=?').get(sheet.id)).toEqual(before);
  });
  it('mantém Pacto separado e usa os benefícios corretos de entrada para a segunda classe', async () => {
    await register();
    const cookie = cookies(await login());
    const response = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...character(),
        classes: [
          { classId: localId('class', 'wizard'), level: 3, initial: true },
          { classId: localId('class', 'warlock'), level: 5, initial: false },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const id = response.json().id;
    const casting = (
      await app.inject({ url: `/characters/${id}/casting`, headers: { cookie } })
    ).json();
    expect(casting.common.state).toBe('known');
    expect(casting.common.slots.find((s: { level: number }) => s.level === 2).maximum).toBe(2);
    expect(casting.pact[0].slots).toEqual([{ level: 3, maximum: 2 }]);
    expect(casting.perClass[0].classLevel).toBe(3);
    const benefits = (
      await app.inject({ url: `/characters/${id}/class-benefits`, headers: { cookie } })
    ).json();
    expect(benefits.items[1].context).toBe('multiclass_entry');
    expect(benefits.items[1].state).toBe('verified');
    expect(benefits.items[1].benefits.armorTraining).toEqual([{ kind: 'Light' }]);
  });
  it('retorna zero para classe sem conjuração', async () => {
    await register();
    const cookie = cookies(await login());
    const response = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...character(),
        classes: [{ classId: localId('class', 'fighter'), level: 1, initial: true }],
      },
    });
    expect(response.statusCode).toBe(201);
    const result = (
      await app.inject({ url: `/characters/${response.json().id}/casting`, headers: { cookie } })
    ).json();
    expect(result.common).toEqual({ state: 'known', slots: [] });
    expect(result.pact).toEqual([]);
  });
  it('audita salvaguardas declaradas como benefício fixo da classe inicial', async () => {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const cls = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(sheet.id) as {
      id: number;
    };
    const grant = await app.inject({
      method: 'POST',
      url: `/characters/${sheet.id}/grants`,
      headers: { origin, cookie },
      payload: {
        originKind: 'class',
        originId: cls.id,
        acquisitionContext: 'initial_class',
        ruleKey: 'wizard.saves',
        acquiredAtLevel: 1,
      },
    });
    expect(grant.statusCode).toBe(201);
    for (const ability of ['wisdom', 'strength'])
      db.prepare(
        "INSERT INTO character_saving_throw(character_id,grant_id,selection_kind,ability) VALUES(?,?,'fixed',?)"
      ).run(sheet.id, grant.json().id, ability);
    const result = (
      await app.inject({ url: `/characters/${sheet.id}/validation`, headers: { cookie } })
    ).json();
    expect(
      result.findings
        .filter((f: { code: string }) => f.code === 'CLASS_SAVING_THROW_SOURCE')
        .map((f: { state: string }) => f.state)
    ).toEqual(['pass', 'fail']);
  });
});

describe('Benefícios de entrada e espaços comuns segundo o SRD anexado', () => {
  async function setup(second = 'bard', level = 1) {
    await register();
    const cookie = cookies(await login());
    const response = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...character(),
        classes: [
          { classId: localId('class', 'wizard'), level: 1, initial: true },
          { classId: localId('class', second), level, initial: false },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const id = response.json().id;
    const cc = db
      .prepare('SELECT id FROM character_class WHERE character_id=? AND is_initial_class=0')
      .get(id) as { id: number };
    const grant = await app.inject({
      method: 'POST',
      url: `/characters/${id}/grants`,
      headers: { origin, cookie },
      payload: {
        originKind: 'class',
        originId: cc.id,
        acquisitionContext: 'multiclass_entry',
        ruleKey: `multiclass-core:${cc.id}`,
        acquiredAtLevel: 2,
      },
    });
    expect(grant.statusCode).toBe(201);
    return { id, cookie, grantId: grant.json().id };
  }
  it('expõe uma escolha de Bardo, audita seu limite e não concede salvaguardas', async () => {
    const { id, cookie, grantId } = await setup();
    const options = (
      await app.inject({ url: `/characters/${id}/benefits/options`, headers: { cookie } })
    ).json();
    const skill = options.items.find(
      (x: { choiceKey: string; grantId: number }) =>
        x.grantId === grantId && x.choiceKey === 'skillChoices:multiclass-training'
    );
    expect(skill.rule.pick).toBe(1);
    for (const name of ['skill-arcana', 'skill-history'])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/characters/${id}/benefits`,
            headers: { origin, cookie },
            payload: {
              kind: 'skill',
              localId: localId('skill', name),
              grantId,
              selectionKind: 'chosen',
              choiceKey: skill.choiceKey,
              proficiencyRank: 1,
            },
          })
        ).statusCode
      ).toBe(201);
    db.prepare(
      "INSERT INTO character_saving_throw(character_id,grant_id,selection_kind,ability) VALUES(?,?,'fixed','charisma')"
    ).run(id, grantId);
    const report = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      report.findings.find((f: { code: string }) => f.code === 'BENEFIT_CHOICE_LIMIT').state
    ).toBe('fail');
    expect(
      report.findings.find((f: { code: string }) => f.code === 'CLASS_SAVING_THROW_SOURCE').state
    ).toBe('fail');
  });
  it('rejeita na auditoria a armadura pesada atribuída à entrada em Guerreiro', async () => {
    const { id, cookie, grantId } = await setup('fighter');
    for (const armor of ['Medium', 'Heavy'])
      db.prepare(
        "INSERT INTO character_armor_training(character_id,grant_id,selection_kind,armor_kind) VALUES(?,?,'fixed',?)"
      ).run(id, grantId, armor);
    for (const category of ['Martial', 'Simple'])
      db.prepare(
        "INSERT INTO character_weapon_training(character_id,grant_id,selection_kind,clause_key,category) VALUES(?,?,'fixed',?,?)"
      ).run(id, grantId, category, category);
    const report = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    const findings = report.findings.filter(
      (f: { code: string }) => f.code === 'MULTICLASS_ARMOR_SOURCE'
    );
    expect(findings.map((f: { state: string }) => f.state)).toEqual(['pass', 'fail']);
    expect(
      report.findings
        .filter((f: { code: string }) => f.code === 'MULTICLASS_WEAPON_SOURCE')
        .map((f: { state: string }) => f.state)
    ).toEqual(['pass', 'fail']);
  });
  it('recalcula espaços após alterar os níveis e mantém limite de magia preparado por classe', async () => {
    const { id, cookie } = await setup('paladin', 3);
    const result = (
      await app.inject({ url: `/characters/${id}/casting`, headers: { cookie } })
    ).json();
    expect(result.common.effectiveCasterLevel).toBe(3);
    expect(result.common.slots[1]).toEqual({ level: 2, maximum: 2 });
    expect(
      result.perClass.find((c: { class: string }) => c.class === 'wizard').casting.maxSpellLevel[0]
    ).toBe(1);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/characters/${id}`,
      headers: { origin, cookie },
      payload: {
        classes: [
          { classId: localId('class', 'wizard'), level: 1, initial: true },
          { classId: localId('class', 'paladin'), level: 5, initial: false },
        ],
        progression: [
          { classId: localId('class', 'wizard'), hpMethod: 'first_max' },
          ...Array.from({ length: 5 }, () => ({
            classId: localId('class', 'paladin'),
            hpMethod: 'average',
          })),
        ],
      },
    });
    expect(updated.statusCode).toBe(200);
    const evolved = (
      await app.inject({ url: `/characters/${id}/casting`, headers: { cookie } })
    ).json();
    expect(evolved.common.effectiveCasterLevel).toBe(4);
    expect(evolved.common.slots[1].maximum).toBe(3);
    expect(result.tracksRemaining).toBe(false);
    expect(result.rulesVerified).toBe(false);
  });
  it('não confunde características de nível 1 ou concessões legadas com os traços iniciais da entrada', async () => {
    const { id, cookie } = await setup('cleric');
    const cc = db
      .prepare('SELECT id FROM character_class WHERE character_id=? AND is_initial_class=0')
      .get(id) as { id: number };
    const response = await app.inject({
      method: 'POST',
      url: `/characters/${id}/grants`,
      headers: { origin, cookie },
      payload: {
        originKind: 'class',
        originId: cc.id,
        acquisitionContext: 'multiclass_entry',
        ruleKey: 'cleric.protector',
        acquiredAtLevel: 2,
      },
    });
    expect(response.statusCode).toBe(201);
    db.prepare(
      "INSERT INTO character_armor_training(character_id,grant_id,selection_kind,armor_kind) VALUES(?,?,'fixed','Heavy')"
    ).run(id, response.json().id);
    const report = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      report.findings.find((f: { code: string }) => f.code === 'MULTICLASS_ARMOR_SOURCE').state
    ).toBe('unknown');
  });
});

describe('Prévia e confirmação de alterações com dependências', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login());
    const sheet = await create(cookie);
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const grant = await post(`/characters/${sheet.id}/grants`, {
      originKind: 'species',
      originId: localId('species', 'human'),
      acquisitionContext: 'species',
      ruleKey: 'human.origin',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    const feat = await post(`/characters/${sheet.id}/benefits`, {
      kind: 'feat',
      localId: localId('feat', 'skilled'),
      grantId: grant.json().id,
      selectionKind: 'fixed',
    });
    expect(feat.statusCode).toBe(201);
    const derived = await post(`/characters/${sheet.id}/grants`, {
      originKind: 'feat',
      originId: feat.json().id,
      acquisitionContext: 'feat',
      ruleKey: 'human.skilled',
      acquiredAtLevel: 1,
    });
    expect(derived.statusCode).toBe(201);
    const skill = await post(`/characters/${sheet.id}/benefits`, {
      kind: 'skill',
      localId: localId('skill', 'skill-arcana'),
      grantId: derived.json().id,
      selectionKind: 'chosen',
      choiceKey: 'toolChoices:benefit-1',
      proficiencyRank: 1,
    });
    expect(skill.statusCode).toBe(201);
    const item = db.prepare('SELECT id FROM lib_item LIMIT 1').get() as { id: number };
    expect((await post(`/characters/${sheet.id}/items`, { itemId: item.id })).statusCode).toBe(201);
    return { cookie, id: sheet.id, post, changes: { speciesId: localId('species', 'elf') } };
  }
  it('simula cascatas sem persistir e aplica somente após confirmação, preservando inventário e narrativa', async () => {
    const { cookie, id, post, changes } = await setup();
    const before = db.prepare('SELECT * FROM character WHERE id=?').get(id),
      audit = db.prepare('SELECT count(*) AS n FROM audit_log').get();
    const first = await post(`/characters/${id}/changes/preview`, changes);
    expect(first.statusCode).toBe(200);
    const plan = first.json();
    expect(plan.requiresConfirmation).toBe(true);
    expect(
      plan.removals.find((r: { table: string }) => r.table === 'character_ability').count
    ).toBe(1);
    expect(plan.removals.find((r: { table: string }) => r.table === 'character_skill').count).toBe(
      1
    );
    expect(
      plan.removals.find((r: { table: string }) => r.table === 'character_rule_grant').count
    ).toBe(2);
    expect(db.prepare('SELECT * FROM character WHERE id=?').get(id)).toEqual(before);
    expect(db.prepare('SELECT count(*) AS n FROM audit_log').get()).toEqual(audit);
    const again = await post(`/characters/${id}/changes/preview`, changes);
    expect(again.json()).toEqual(plan);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: changes,
        })
      ).statusCode
    ).toBe(409);
    const applied = await app.inject({
      method: 'PATCH',
      url: `/characters/${id}`,
      headers: { origin, cookie },
      payload: { ...changes, confirmationToken: plan.confirmationToken },
    });
    expect(applied.statusCode).toBe(200);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_ability WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    expect(
      db.prepare('SELECT count(*) AS n FROM character_skill WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    expect(
      db.prepare('SELECT count(*) AS n FROM character_item WHERE character_id=?').get(id)
    ).toEqual({ n: 1 });
    expect(
      db.prepare('SELECT backstory FROM character_narrative WHERE character_id=?').get(id)
    ).toEqual({ backstory: 'Aprendiz de magia' });
    expect(
      db.prepare("SELECT count(*) AS n FROM audit_log WHERE action='character.reconcile'").get()
    ).toEqual({ n: 1 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('recusa token antigo ou de outra alteração depois de editar uma dependência', async () => {
    const { cookie, id, post, changes } = await setup();
    const plan = (await post(`/characters/${id}/changes/preview`, changes)).json();
    const feat = db.prepare('SELECT id FROM character_ability WHERE character_id=?').get(id) as {
      id: number;
    };
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}/benefits/feat/${feat.id}`,
          headers: { origin, cookie },
          payload: { notes: 'Alteração posterior' },
        })
      ).statusCode
    ).toBe(200);
    for (const input of [changes, { speciesId: localId('species', 'dwarf') }]) {
      const result = await app.inject({
        method: 'PATCH',
        url: `/characters/${id}`,
        headers: { origin, cookie },
        payload: { ...input, confirmationToken: plan.confirmationToken },
      });
      expect(result.statusCode).toBe(409);
      expect(result.json().error.code).toBe('CHANGE_PREVIEW_STALE');
    }
    expect(
      db.prepare('SELECT count(*) AS n FROM character_ability WHERE character_id=?').get(id)
    ).toEqual({ n: 1 });
  });
  it('protege permissões e reverte tudo se a gravação final falhar', async () => {
    const { cookie, id, post, changes } = await setup();
    await register('outsider@example.invalid', 'outsider');
    const outsider = cookies(await login('outsider@example.invalid'));
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/characters/${id}/changes/preview`,
          headers: { origin, cookie: outsider },
          payload: changes,
        })
      ).statusCode
    ).toBe(404);
    const plan = (await post(`/characters/${id}/changes/preview`, changes)).json();
    db.exec(
      "CREATE TRIGGER reject_reconcile BEFORE INSERT ON audit_log WHEN NEW.action='character.reconcile' BEGIN SELECT RAISE(ABORT,'audit failed'); END"
    );
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { ...changes, confirmationToken: plan.confirmationToken },
        })
      ).statusCode
    ).toBe(400);
    expect(db.prepare('SELECT species_id FROM dnd_character WHERE character_id=?').get(id)).toEqual(
      { species_id: localId('species', 'human') }
    );
    expect(
      db.prepare('SELECT count(*) AS n FROM character_skill WHERE character_id=?').get(id)
    ).toEqual({ n: 1 });
    expect(
      (await post(`/characters/${id}/changes/preview`, { speciesId: 999999 })).statusCode
    ).toBe(400);
  });
  it('mantém edições sem remoções no PATCH existente sem exigir confirmação', async () => {
    const { cookie, id, post } = await setup();
    const plan = await post(`/characters/${id}/changes/preview`, { name: 'Novo nome' });
    expect(plan.statusCode).toBe(200);
    expect(plan.json().requiresConfirmation).toBe(false);
    expect(plan.json().removals).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { name: 'Novo nome' },
        })
      ).statusCode
    ).toBe(200);
  });
  it('remove o antecedente e suas magias sem tocar nos benefícios da espécie', async () => {
    const { cookie, id, post } = await setup();
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'background',
      originId: localId('background', 'criminal'),
      acquisitionContext: 'background',
      ruleKey: 'criminal.origin',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          spellId: localId('spell', 'magic-missile'),
          originKind: 'background',
          originId: localId('background', 'criminal'),
          preparationMode: 'granted',
        })
      ).statusCode
    ).toBe(201);
    const changes = { backgroundId: null },
      plan = await post(`/characters/${id}/changes/preview`, changes);
    expect(plan.statusCode).toBe(200);
    expect(
      plan.json().removals.find((r: { table: string }) => r.table === 'character_spell').count
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { ...changes, confirmationToken: plan.json().confirmationToken },
        })
      ).statusCode
    ).toBe(200);
    expect(
      db.prepare('SELECT background_id FROM dnd_character WHERE character_id=?').get(id)
    ).toEqual({ background_id: null });
    expect(
      db.prepare('SELECT count(*) AS n FROM character_ability WHERE character_id=?').get(id)
    ).toEqual({ n: 1 });
  });
  it('troca a subclasse removendo apenas sua origem, preservando magias da classe e grimório', async () => {
    await register();
    const cookie = cookies(await login());
    const wizard = localId('class', 'wizard');
    const subs = db
      .prepare('SELECT id FROM lib_subclass WHERE class_id=? ORDER BY id LIMIT 2')
      .all(wizard) as { id: number }[];
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...character(),
        classes: [{ classId: wizard, level: 3, initial: true, subclassId: subs[0]!.id }],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(id) as {
      id: number;
    };
    for (const originKind of ['class', 'subclass'])
      expect(
        (
          await post(`/characters/${id}/spells`, {
            spellId: localId('spell', 'magic-missile'),
            originKind,
            originId: cc.id,
            preparationMode: 'selectable',
          })
        ).statusCode
      ).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spellbook`, {
          spellId: localId('spell', 'magic-missile'),
          characterClassId: cc.id,
        })
      ).statusCode
    ).toBe(201);
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'subclass',
      originId: cc.id,
      acquisitionContext: 'class_progression',
      ruleKey: 'subclass.feature',
      acquiredAtLevel: 3,
    });
    expect(grant.statusCode).toBe(201);
    const changes = {
      classes: [{ classId: wizard, level: 3, initial: true, subclassId: subs[1]!.id }],
      progression: [
        { classId: wizard, hpMethod: 'first_max' },
        { classId: wizard, hpMethod: 'average' },
        { classId: wizard, hpMethod: 'average' },
      ],
    };
    const plan = await post(`/characters/${id}/changes/preview`, changes);
    expect(plan.statusCode).toBe(200);
    expect(
      plan.json().removals.find((r: { table: string }) => r.table === 'character_spell').count
    ).toBe(1);
    expect(
      plan.json().removals.find((r: { table: string }) => r.table === 'character_spellbook_entry')
    ).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { ...changes, confirmationToken: plan.json().confirmationToken },
        })
      ).statusCode
    ).toBe(200);
    expect(
      db.prepare('SELECT origin_kind FROM character_spell WHERE character_id=?').all(id)
    ).toEqual([{ origin_kind: 'class' }]);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spellbook_entry WHERE character_id=?').get(id)
    ).toEqual({ n: 1 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('expõe a reinicialização por redução de nível e não perde nada sem confirmação', async () => {
    await register();
    const cookie = cookies(await login());
    const wizard = localId('class', 'wizard');
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: { ...character(), classes: [{ classId: wizard, level: 2, initial: true }] },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(id) as {
      id: number;
    };
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    expect(
      (
        await post(`/characters/${id}/spellbook`, {
          spellId: localId('spell', 'magic-missile'),
          characterClassId: cc.id,
        })
      ).statusCode
    ).toBe(201);
    const changes = { classes: [{ classId: wizard, level: 1, initial: true }] };
    const plan = await post(`/characters/${id}/changes/preview`, changes);
    expect(plan.statusCode).toBe(200);
    expect(plan.json().requiresConfirmation).toBe(true);
    expect(
      plan.json().removals.find((r: { table: string }) => r.table === 'character_spellbook_entry')
        .count
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: changes,
        })
      ).statusCode
    ).toBe(409);
    expect(db.prepare('SELECT level FROM character_class WHERE id=?').get(cc.id)).toEqual({
      level: 2,
    });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { ...changes, confirmationToken: plan.json().confirmationToken },
        })
      ).statusCode
    ).toBe(200);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spellbook_entry WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
  });
  it('concilia a troca da classe inicial e a remoção de uma classe sem apagar magias da outra', async () => {
    await register();
    const cookie = cookies(await login());
    const wizard = localId('class', 'wizard'),
      cleric = localId('class', 'cleric');
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...character(),
        classes: [
          { classId: wizard, level: 1, initial: true },
          { classId: cleric, level: 1, initial: false },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const cc = db
      .prepare('SELECT id,class_id FROM character_class WHERE character_id=? ORDER BY id')
      .all(id) as { id: number; class_id: number }[];
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    for (const row of cc) {
      const initial = row.class_id === wizard;
      expect(
        (
          await post(`/characters/${id}/grants`, {
            originKind: 'class',
            originId: row.id,
            acquisitionContext: initial ? 'initial_class' : 'multiclass_entry',
            ruleKey: `initial.${row.id}`,
            acquiredAtLevel: initial ? 1 : 2,
          })
        ).statusCode
      ).toBe(201);
    }
    const clericRow = cc.find((c) => c.class_id === cleric)!,
      wizardRow = cc.find((c) => c.class_id === wizard)!;
    expect(
      (
        await post(`/characters/${id}/spells`, {
          spellId: localId('spell', 'light'),
          originKind: 'class',
          originId: clericRow.id,
          preparationMode: 'cantrip',
        })
      ).statusCode
    ).toBe(201);
    const swap = {
      classes: [
        { classId: wizard, level: 1, initial: false },
        { classId: cleric, level: 1, initial: true },
      ],
      progression: [
        { classId: cleric, hpMethod: 'first_max' },
        { classId: wizard, hpMethod: 'average' },
      ],
    };
    const plan = await post(`/characters/${id}/changes/preview`, swap);
    expect(plan.statusCode).toBe(200);
    expect(
      plan.json().removals.find((r: { table: string }) => r.table === 'character_rule_grant').count
    ).toBe(2);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { ...swap, confirmationToken: plan.json().confirmationToken },
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          spellId: localId('spell', 'magic-missile'),
          originKind: 'class',
          originId: wizardRow.id,
          preparationMode: 'selectable',
        })
      ).statusCode
    ).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spellbook`, {
          spellId: localId('spell', 'magic-missile'),
          characterClassId: wizardRow.id,
        })
      ).statusCode
    ).toBe(201);
    const changes = { classes: [{ classId: cleric, level: 1, initial: true }] },
      removal = await post(`/characters/${id}/changes/preview`, changes);
    expect(removal.statusCode).toBe(200);
    expect(removal.json().requiresConfirmation).toBe(true);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: { ...changes, confirmationToken: removal.json().confirmationToken },
        })
      ).statusCode
    ).toBe(200);
    expect(
      db
        .prepare('SELECT origin_character_class_id FROM character_spell WHERE character_id=?')
        .all(id)
    ).toEqual([{ origin_character_class_id: clericRow.id }]);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spellbook_entry WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('Magias vinculadas a escolhas aninhadas', () => {
  async function setup() {
    await register();
    const cookie = cookies(await login()),
      ranger = localId('class', 'ranger');
    const response = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: { ...character(), classes: [{ classId: ranger, level: 2, initial: true }] },
    });
    expect(response.statusCode).toBe(201);
    const id = response.json().id;
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(id) as {
      id: number;
    };
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc.id,
      acquisitionContext: 'class_progression',
      ruleKey: 'ranger.druidic-warrior',
      acquiredAtLevel: 2,
    });
    expect(grant.statusCode).toBe(201);
    const choice = await post(`/characters/${id}/choices`, {
      grantId: grant.json().id,
      choiceId: 'fighting-style',
      optionId: 'druidic-warrior',
    });
    expect(choice.statusCode).toBe(201);
    const payload = {
      spellId: localId('spell', 'guidance'),
      originKind: 'class',
      originId: cc.id,
      preparationMode: 'cantrip',
      choiceInstanceId: choice.json().id,
      nestedChoiceKey: 'spellChoices:druidic-warrior',
    };
    return {
      cookie,
      id,
      cc: cc.id,
      choiceId: choice.json().id,
      grantId: grant.json().id,
      post,
      payload,
    };
  }
  it('aplica lista, nível e limite de dois truques sem contar na lista padrão da classe', async () => {
    const { cookie, id, post, payload } = await setup();
    for (const slug of ['light', 'magic-missile'])
      expect(
        (await post(`/characters/${id}/spells`, { ...payload, spellId: localId('spell', slug) }))
          .statusCode
      ).toBe(400);
    for (const slug of ['guidance', 'druidcraft'])
      expect(
        (await post(`/characters/${id}/spells`, { ...payload, spellId: localId('spell', slug) }))
          .statusCode
      ).toBe(201);
    const limit = await post(`/characters/${id}/spells`, {
      ...payload,
      spellId: localId('spell', 'produce-flame'),
    });
    expect(limit.statusCode).toBe(400);
    expect(limit.json().error.code).toBe('NESTED_SPELL_LIMIT');
    const result = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      result.findings
        .filter((f: { code: string }) => f.code === 'NESTED_SPELL_SELECTION')
        .map((f: { state: string }) => f.state)
    ).toEqual(['pass', 'pass']);
    expect(
      result.findings.find((f: { code: string }) => f.code === 'NESTED_SPELL_CHOICES').state
    ).toBe('pass');
    expect(
      result.findings.find((f: { code: string }) => f.code === 'CLASS_CANTRIP_LIMIT').evidence
        .selected
    ).toBe(0);
  });
  it('vincula legado explicitamente, preserva id e aplica FKs de mesmo personagem', async () => {
    const { cookie, id, post, payload, choiceId, grantId } = await setup();
    const { choiceInstanceId, nestedChoiceKey, ...legacy } = payload;
    const spell = await post(`/characters/${id}/spells`, legacy);
    expect(spell.statusCode).toBe(201);
    const instance = spell.json().id;
    db.exec(
      "CREATE TRIGGER reject_link_audit BEFORE INSERT ON audit_log WHEN NEW.action='spell.link-choice' BEGIN SELECT RAISE(ABORT,'audit failed'); END"
    );
    expect(
      (
        await post(`/characters/${id}/spells/${instance}/nested-origin`, {
          choiceInstanceId,
          nestedChoiceKey,
        })
      ).statusCode
    ).toBe(400);
    expect(
      db.prepare('SELECT choice_instance_id FROM character_spell WHERE id=?').get(instance)
    ).toEqual({ choice_instance_id: null });
    db.exec('DROP TRIGGER reject_link_audit');
    expect(
      (
        await post(`/characters/${id}/spells/${instance}/nested-origin`, {
          choiceInstanceId,
          nestedChoiceKey,
        })
      ).statusCode
    ).toBe(200);
    expect(
      db.prepare('SELECT choice_instance_id FROM character_spell WHERE id=?').get(instance)
    ).toEqual({ choice_instance_id: choiceId });
    const duplicateLegacy = await post(`/characters/${id}/spells`, legacy);
    expect(duplicateLegacy.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spells/${duplicateLegacy.json().id}/nested-origin`, {
          choiceInstanceId,
          nestedChoiceKey,
        })
      ).statusCode
    ).toBe(400);
    expect(
      db
        .prepare('SELECT choice_instance_id FROM character_spell WHERE id=?')
        .get(duplicateLegacy.json().id)
    ).toEqual({ choice_instance_id: null });

    const other = await create(cookie);
    const otherCc = db
      .prepare('SELECT id FROM character_class WHERE character_id=?')
      .get(other.id) as { id: number };
    const unrelated = await post(`/characters/${other.id}/spells`, {
      ...legacy,
      originId: otherCc.id,
    });
    expect(unrelated.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${other.id}/spells/${unrelated.json().id}/nested-origin`, {
          choiceInstanceId,
          nestedChoiceKey,
        })
      ).statusCode
    ).toBe(400);
    expect(() =>
      db
        .prepare('UPDATE character_spell SET choice_instance_id=?,nested_choice_key=? WHERE id=?')
        .run(choiceId, nestedChoiceKey, unrelated.json().id)
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      db.prepare('UPDATE character_spell SET nested_choice_key=NULL WHERE id=?').run(instance)
    ).toThrow(/CHECK/);
    expect(
      (await post(`/characters/${id}/spells`, { ...legacy, choiceInstanceId })).statusCode
    ).toBe(400);
  });
  it('exige prévia para excluir opção com magias e protege contra token de outra exclusão', async () => {
    const { cookie, id, post, payload, choiceId, grantId } = await setup();
    expect((await post(`/characters/${id}/spells`, payload)).statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/choices/${choiceId}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(409);
    const equipment = await post(`/characters/${id}/choices`, {
      grantId,
      choiceId: 'equipment',
      optionId: 'b',
    });
    expect(equipment.statusCode).toBe(201);
    const preview = await post(`/characters/${id}/choices/${choiceId}/removal-preview`, {});
    expect(preview.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/choices/${equipment.json().id}?confirmationToken=${preview.json().confirmationToken}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(409);
    expect(
      preview.json().removals.find((r: { table: string }) => r.table === 'character_spell').count
    ).toBe(1);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spell WHERE character_id=?').get(id)
    ).toEqual({ n: 1 });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/choices/${choiceId}?confirmationToken=${preview.json().confirmationToken}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spell WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('valida magia fixa, nível de liberação e modo de preparação', async () => {
    await register();
    const cookie = cookies(await login());
    const speciesId = localId('species', 'elf');
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: { ...character(), speciesId },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'species',
      originId: speciesId,
      acquisitionContext: 'species',
      ruleKey: 'elf.drow',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    const choice = await post(`/characters/${id}/choices`, {
      grantId: grant.json().id,
      choiceId: 'lineage',
      optionId: 'drow',
    });
    expect(choice.statusCode).toBe(201);
    const payload = {
      spellId: localId('spell', 'dancing-lights'),
      originKind: 'species',
      originId: speciesId,
      preparationMode: 'cantrip',
      choiceInstanceId: choice.json().id,
      nestedChoiceKey: 'spellsFixed:dancing-lights',
    };
    expect((await post(`/characters/${id}/spells`, payload)).statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...payload,
          spellId: localId('spell', 'guidance'),
        })
      ).statusCode
    ).toBe(400);
    const early = await post(`/characters/${id}/spells`, {
      ...payload,
      spellId: localId('spell', 'faerie-fire'),
      nestedChoiceKey: 'spellsFixed:faerie-fire',
      preparationMode: 'always_prepared',
    });
    expect(early.statusCode).toBe(400);
    expect(early.json().error.code).toBe('NESTED_LEVEL');
    const wizard = localId('class', 'wizard');
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}`,
          headers: { origin, cookie },
          payload: {
            classes: [{ classId: wizard, level: 3, initial: true }],
            progression: [
              { classId: wizard, hpMethod: 'first_max' },
              { classId: wizard, hpMethod: 'average' },
              { classId: wizard, hpMethod: 'average' },
            ],
          },
        })
      ).statusCode
    ).toBe(200);
    const unlocked = {
      ...payload,
      spellId: localId('spell', 'faerie-fire'),
      nestedChoiceKey: 'spellsFixed:faerie-fire',
      preparationMode: 'granted',
    };
    const wrongMode = await post(`/characters/${id}/spells`, unlocked);
    expect(wrongMode.statusCode).toBe(400);
    expect(wrongMode.json().error.code).toBe('NESTED_PREPARATION');
    expect(
      (await post(`/characters/${id}/spells`, { ...unlocked, preparationMode: 'always_prepared' }))
        .statusCode
    ).toBe(201);

    const report = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      report.findings.find((f: { code: string }) => f.code === 'NESTED_SPELL_SELECTION').state
    ).toBe('pass');
  });
});

describe('Magic Initiate — escolhas diretas do talento', () => {
  async function setup(background?: string) {
    await register();
    const cookie = cookies(await login());
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: {
        ...character(),
        ...(background ? { backgroundId: localId('background', background) } : {}),
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const grant = await post(`/characters/${id}/grants`, {
      originKind: background ? 'background' : 'species',
      originId: background ? localId('background', background) : localId('species', 'human'),
      acquisitionContext: background ? 'background' : 'species',
      ruleKey: 'origin.feat',
      acquiredAtLevel: 1,
    });
    expect(grant.statusCode).toBe(201);
    async function feat() {
      const response = await post(`/characters/${id}/benefits`, {
        kind: 'feat',
        localId: localId('feat', 'magic-initiate'),
        grantId: grant.json().id,
        selectionKind: background ? 'fixed' : 'chosen',
        ...(!background ? { choiceKey: 'featChoices:versatile' } : {}),
      });
      expect(response.statusCode).toBe(201);
      const featId = response.json().id;
      const origin = await post(`/characters/${id}/grants`, {
        originKind: 'feat',
        originId: featId,
        acquisitionContext: 'feat',
        ruleKey: `magic-initiate.${featId}`,
        acquiredAtLevel: 1,
      });
      expect(origin.statusCode).toBe(201);
      return { featId, grantId: origin.json().id };
    }
    return { id, cookie, post, feat };
  }
  it('oferece configuração compartilhada e valida duas magias menores e uma de nível 1', async () => {
    const { id, cookie, post, feat } = await setup();
    const occurrence = await feat();
    const options = (
      await app.inject({ url: `/characters/${id}/choices`, headers: { cookie } })
    ).json().options;
    const configured = options.find(
      (o: { grantId: number; choiceId: string }) =>
        o.grantId === occurrence.grantId && o.choiceId === 'app:magic-initiate'
    );
    expect(configured.options).toHaveLength(9);
    const choice = await post(`/characters/${id}/choices`, {
      grantId: occurrence.grantId,
      choiceId: 'app:magic-initiate',
      optionId: 'wizard:intelligence',
    });
    expect(choice.statusCode).toBe(201);
    const base = {
      originKind: 'feat',
      originId: occurrence.featId,
      choiceInstanceId: choice.json().id,
      nestedChoiceKey: 'spellChoices:two-cantrips',
      preparationMode: 'cantrip',
    };
    expect(
      (await post(`/characters/${id}/spells`, { ...base, spellId: localId('spell', 'guidance') }))
        .statusCode
    ).toBe(400);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...base,
          spellId: localId('spell', 'mage-hand'),
          castingAbilityChoice: 'wisdom',
        })
      ).statusCode
    ).toBe(400);
    const first = await post(`/characters/${id}/spells`, {
      ...base,
      spellId: localId('spell', 'mage-hand'),
    });
    expect(first.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...base,
          spellId: localId('spell', 'ray-of-frost'),
        })
      ).statusCode
    ).toBe(201);
    expect(
      (await post(`/characters/${id}/spells`, { ...base, spellId: localId('spell', 'light') }))
        .statusCode
    ).toBe(400);
    const leveled = {
      ...base,
      nestedChoiceKey: 'spellChoices:level-1-spell',
      spellId: localId('spell', 'magic-missile'),
      preparationMode: 'selectable',
    };
    expect((await post(`/characters/${id}/spells`, leveled)).statusCode).toBe(400);
    expect(
      (await post(`/characters/${id}/spells`, { ...leveled, preparationMode: 'always_prepared' }))
        .statusCode
    ).toBe(201);
    expect(
      db
        .prepare('SELECT DISTINCT casting_ability_choice FROM character_spell WHERE character_id=?')
        .all(id)
    ).toEqual([{ casting_ability_choice: 'intelligence' }]);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}/spells/${first.json().id}`,
          headers: { origin, cookie },
          payload: { castingAbilityChoice: 'wisdom' },
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/characters/${id}/spells/${first.json().id}`,
          headers: { origin, cookie },
          payload: { castingAbilityChoice: null },
        })
      ).statusCode
    ).toBe(400);
    const report = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      report.findings.find((f: { code: string }) => f.code === 'MAGIC_INITIATE_CONFIGURATION').state
    ).toBe('pass');
    expect(
      report.findings
        .filter((f: { code: string }) => f.code === 'NESTED_SPELL_SELECTION')
        .every((f: { state: string }) => f.state === 'pass')
    ).toBe(true);
  });
  it('exige lista diferente em cada ocorrência, mesmo com outro atributo ou outra concessão', async () => {
    const { id, post, feat } = await setup();
    const first = await feat(),
      second = await feat();
    expect(
      (
        await post(`/characters/${id}/choices`, {
          grantId: first.grantId,
          choiceId: 'app:magic-initiate',
          optionId: 'wizard:intelligence',
        })
      ).statusCode
    ).toBe(201);
    const repeated = await post(`/characters/${id}/choices`, {
      grantId: second.grantId,
      choiceId: 'app:magic-initiate',
      optionId: 'wizard:wisdom',
    });
    expect(repeated.statusCode).toBe(400);
    expect(repeated.json().error.code).toBe('MAGIC_INITIATE_LIST_REUSED');
    expect(
      (
        await post(`/characters/${id}/choices`, {
          grantId: second.grantId,
          choiceId: 'app:magic-initiate',
          optionId: 'druid:wisdom',
        })
      ).statusCode
    ).toBe(201);
  });
  it('respeita a lista qualificada pelo antecedente no catálogo', async () => {
    const { id, cookie, post, feat } = await setup('sage');
    const occurrence = await feat();
    const options = (await app.inject({ url: `/characters/${id}/choices`, headers: { cookie } }))
      .json()
      .options.find((o: { grantId: number }) => o.grantId === occurrence.grantId);
    expect(options.options.map((o: { id: string }) => o.id)).toEqual([
      'wizard:intelligence',
      'wizard:wisdom',
      'wizard:charisma',
    ]);
    expect(
      (
        await post(`/characters/${id}/choices`, {
          grantId: occurrence.grantId,
          choiceId: 'app:magic-initiate',
          optionId: 'cleric:wisdom',
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await post(`/characters/${id}/choices`, {
          grantId: occurrence.grantId,
          choiceId: 'app:magic-initiate',
          optionId: 'wizard:charisma',
        })
      ).statusCode
    ).toBe(201);
  });
  it('atribui atributo ao vincular legado e detecta divergência posterior na auditoria', async () => {
    const { id, cookie, post, feat } = await setup();
    const occurrence = await feat();
    const choice = await post(`/characters/${id}/choices`, {
      grantId: occurrence.grantId,
      choiceId: 'app:magic-initiate',
      optionId: 'wizard:charisma',
    });
    expect(choice.statusCode).toBe(201);
    const legacy = await post(`/characters/${id}/spells`, {
      spellId: localId('spell', 'mage-hand'),
      originKind: 'feat',
      originId: occurrence.featId,
      preparationMode: 'cantrip',
      notes: 'Preservar',
    });
    expect(legacy.statusCode).toBe(201);
    expect(
      (
        await post(`/characters/${id}/spells/${legacy.json().id}/nested-origin`, {
          choiceInstanceId: choice.json().id,
          nestedChoiceKey: 'spellChoices:two-cantrips',
        })
      ).statusCode
    ).toBe(200);
    expect(
      db
        .prepare('SELECT casting_ability_choice,notes FROM character_spell WHERE id=?')
        .get(legacy.json().id)
    ).toEqual({ casting_ability_choice: 'charisma', notes: 'Preservar' });
    db.prepare("UPDATE character_spell SET casting_ability_choice='wisdom' WHERE id=?").run(
      legacy.json().id
    );
    const report = (
      await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
    ).json();
    expect(
      report.findings.find((f: { code: string }) => f.code === 'NESTED_SPELL_SELECTION').state
    ).toBe('fail');
  });
});

describe('Motor genérico de efeitos de magias de talentos', () => {
  async function setup(slug: string) {
    await register();
    const cookie = cookies(await login());
    const wizard = localId('class', 'wizard');
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload: { ...character(), classes: [{ classId: wizard, level: 4, initial: true }] },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const cc = db.prepare('SELECT id FROM character_class WHERE character_id=?').get(id) as {
      id: number;
    };
    const post = (path: string, payload: unknown) =>
      app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload });
    const parent = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc.id,
      acquisitionContext: 'class_progression',
      ruleKey: 'wizard.feat-4',
      acquiredAtLevel: 4,
    });
    expect(parent.statusCode).toBe(201);
    const feat = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: localId('feat', slug),
      grantId: parent.json().id,
      selectionKind: 'chosen',
      choiceKey: 'featChoices:feat-4',
    });
    expect(feat.statusCode).toBe(201);
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: feat.json().id,
      acquisitionContext: 'feat',
      ruleKey: `feat.${slug}`,
      acquiredAtLevel: 4,
    });
    expect(grant.statusCode).toBe(201);
    expect(grant.json().spellChoiceInstanceId).toBeTypeOf('number');
    const base = {
      originKind: 'feat',
      originId: feat.json().id,
      choiceInstanceId: grant.json().spellChoiceInstanceId,
      preparationMode: 'always_prepared',
    };
    return {
      id,
      cookie,
      post,
      featId: feat.json().id,
      grantId: grant.json().id,
      choiceId: grant.json().spellChoiceInstanceId,
      base,
      wizard,
    };
  }
  it.each([
    ['fey-touched', 'misty-step', 'fey-magic', 'detect-magic', 'magic-missile'],
    ['shadow-touched', 'invisibility', 'shadow-magic', 'silent-image', 'detect-magic'],
  ])(
    'interpreta magias fixas e escolas de %s sem regra codificada por talento',
    async (slug, fixed, key, allowed, denied) => {
      const { id, cookie, post, choiceId, base } = await setup(slug);
      const options = (
        await app.inject({ url: `/characters/${id}/choices`, headers: { cookie } })
      ).json();
      expect(options.selected.find((c: { id: number }) => c.id === choiceId).choice_id).toBe(
        'app:feat-spells'
      );
      expect(
        (
          await post(`/characters/${id}/spells`, {
            ...base,
            spellId: localId('spell', fixed),
            nestedChoiceKey: `spellsFixed:${fixed}`,
          })
        ).statusCode
      ).toBe(201);
      expect(
        (
          await post(`/characters/${id}/spells`, {
            ...base,
            spellId: localId('spell', denied),
            nestedChoiceKey: `spellChoices:${key}`,
          })
        ).statusCode
      ).toBe(400);
      expect(
        (
          await post(`/characters/${id}/spells`, {
            ...base,
            spellId: localId('spell', allowed),
            nestedChoiceKey: `spellChoices:${key}`,
          })
        ).statusCode
      ).toBe(201);
      const report = (
        await app.inject({ url: `/characters/${id}/validation`, headers: { cookie } })
      ).json();
      expect(
        report.findings
          .filter((f: { code: string }) => f.code === 'NESTED_SPELL_SELECTION')
          .every((f: { state: string }) => f.state === 'pass')
      ).toBe(true);
      expect(
        report.findings.find((f: { code: string }) => f.code === 'FEAT_SPELL_EFFECTS_PARTIAL').state
      ).toBe('unknown');
      expect(report.rulesVerified).toBe(false);
    }
  );
  it('aplica ritual, nível e orçamento dinâmico sem multiplicá-lo por concessões', async () => {
    const { id, cookie, post, featId, choiceId, base, wizard } = await setup('ritual-caster');
    const payload = { ...base, nestedChoiceKey: 'spellChoices:ritual-spells' };
    for (const slug of ['mage-armor', 'augury'])
      expect(
        (await post(`/characters/${id}/spells`, { ...payload, spellId: localId('spell', slug) }))
          .statusCode
      ).toBe(400);
    for (const slug of ['detect-magic', 'identify'])
      expect(
        (await post(`/characters/${id}/spells`, { ...payload, spellId: localId('spell', slug) }))
          .statusCode
      ).toBe(201);
    const extra = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: featId,
      acquisitionContext: 'feat',
      ruleKey: 'ritual.other',
      acquiredAtLevel: 4,
    });
    expect(extra.statusCode).toBe(201);
    expect(extra.json().spellChoiceInstanceId).toBe(choiceId);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...payload,
          spellId: localId('spell', 'unseen-servant'),
        })
      ).statusCode
    ).toBe(400);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/characters/${id}`,
      headers: { origin, cookie },
      payload: {
        classes: [{ classId: wizard, level: 5, initial: true }],
        progression: [
          { classId: wizard, hpMethod: 'first_max' },
          ...Array.from({ length: 4 }, () => ({ classId: wizard, hpMethod: 'average' })),
        ],
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...payload,
          spellId: localId('spell', 'unseen-servant'),
        })
      ).statusCode
    ).toBe(201);
  });
  it('revoga o grupo e as magias junto com o talento sem afetar o catálogo', async () => {
    const { id, cookie, post, featId, choiceId, base } = await setup('fey-touched');
    expect(
      (
        await post(`/characters/${id}/spells`, {
          ...base,
          spellId: localId('spell', 'misty-step'),
          nestedChoiceKey: 'spellsFixed:misty-step',
        })
      ).statusCode
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/benefits/feat/${featId}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(409);
    const preview = await post(`/characters/${id}/benefits/feat/${featId}/removal-preview`, {});
    expect(preview.statusCode).toBe(200);
    expect(
      preview.json().removals.find((r: { table: string }) => r.table === 'character_spell').count
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/characters/${id}/benefits/feat/${featId}?confirmationToken=${preview.json().confirmationToken}`,
          headers: { origin, cookie },
        })
      ).statusCode
    ).toBe(204);
    expect(db.prepare('SELECT id FROM character_choice WHERE id=?').get(choiceId)).toBeUndefined();
    expect(
      db.prepare('SELECT count(*) AS n FROM character_spell WHERE character_id=?').get(id)
    ).toEqual({ n: 0 });
    expect(
      db.prepare('SELECT id FROM lib_spell WHERE id=?').get(localId('spell', 'misty-step'))
    ).toBeTruthy();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('Motor consolidado de efeitos estruturados', () => {
  async function setup(slug = 'ability-score-improvement', scores = {}) {
    await register();
    const cookie = cookies(await login());
    const payload = character();
    payload.classes[0]!.level = 4;
    Object.assign(payload.attributes, scores);
    const created = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: { origin, cookie },
      payload,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers: { origin, cookie }, payload });
    const root = await post(`/characters/${id}/grants`, {
      originKind: 'background',
      originId: payload.backgroundId,
      acquisitionContext: 'background',
      ruleKey: 'draft',
      acquiredAtLevel: 1,
    });
    const feat = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: localId('feat', slug),
      grantId: root.json().id,
      selectionKind: 'fixed',
    });
    expect(feat.statusCode).toBe(201);
    const grant = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: feat.json().id,
      acquisitionContext: 'feat',
      ruleKey: 'effects',
      acquiredAtLevel: 4,
    });
    expect(grant.statusCode).toBe(201);
    const source = db
      .prepare('SELECT data FROM lib_feat WHERE id=?')
      .get(localId('feat', slug)) as { data: string };
    const rule = JSON.parse(source.data).effects.abilityBoosts[0].id;
    const put = (abilities: string[]) =>
      app.inject({
        method: 'PUT',
        url: `/characters/${id}/effects/${grant.json().id}/ability-boosts/${rule}`,
        headers: { origin, cookie },
        payload: { abilities },
      });
    return { id, cookie, put, post, grantId: grant.json().id, featId: feat.json().id };
  }
  it('mantém a base, distribui 2 pontos, substitui e remove escolhas sem duplicar', async () => {
    const x = await setup();
    expect((await x.put(['intelligence', 'intelligence'])).json()).toMatchObject({
      base: { intelligence: 16 },
      effective: { intelligence: 18 },
    });
    expect((await x.put(['wisdom', 'charisma'])).json()).toMatchObject({
      effective: { intelligence: 16, wisdom: 15, charisma: 15 },
    });
    const detail = await app.inject({ url: `/characters/${x.id}`, headers: { cookie: x.cookie } });
    expect(detail.json()).toMatchObject({ baseAttributes: { intelligence: 16 } });
    expect((await x.put([])).json()).toMatchObject({ effective: { wisdom: 14, charisma: 14 } });
  });
  it('rejeita orçamento e limites sem persistência parcial', async () => {
    const x = await setup('ability-score-improvement', { intelligence: 19 });
    expect((await x.put(['intelligence', 'intelligence'])).statusCode).toBe(400);
    expect((await x.put(['intelligence', 'wisdom', 'charisma'])).statusCode).toBe(400);
    expect(db.prepare('SELECT count(*) n FROM character_ability_boost').get()).toEqual({ n: 0 });
    expect((await x.put(['intelligence', 'wisdom'])).statusCode).toBe(200);
  });
  it('rejeita atributo não permitido pelo talento', async () => {
    const x = await setup('actor');
    expect((await x.put(['intelligence'])).statusCode).toBe(400);
    expect((await x.put(['charisma'])).json()).toMatchObject({ effective: { charisma: 15 } });
  });
  it('projeta resistência de Resilient sem duplicar registros', async () => {
    const x = await setup('resilient');
    expect((await x.put(['constitution'])).statusCode).toBe(200);
    const r = await app.inject({
      url: `/characters/${x.id}/effects`,
      headers: { cookie: x.cookie },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().projected.savingThrows).toContain('constitution');
    expect(r.json().coverage).toMatchObject({ structuredEffectTypes: 13, unrecognizedFields: [] });
  });
  it('não permite que o próprio bônus satisfaça o pré-requisito', async () => {
    const x = await setup('actor', { charisma: 12 });
    expect((await x.put(['charisma'])).statusCode).toBe(200);
    const r = await app.inject({
      url: `/characters/${x.id}/validation`,
      headers: { cookie: x.cookie },
    });
    expect(r.statusCode).toBe(200);
    expect(
      r
        .json()
        .findings.find(
          (f: { code: string; entityId: number }) =>
            f.code === 'FEAT_PREREQUISITES' && f.entityId === x.featId
        ).state
    ).toBe('fail');
  });
  it('isola orçamentos entre concessões da mesma origem e impede duplicação', async () => {
    const x = await setup();
    await x.put(['wisdom', 'wisdom']);
    const g = await x.post(`/characters/${x.id}/grants`, {
      originKind: 'feat',
      originId: x.featId,
      acquisitionContext: 'feat',
      ruleKey: 'second',
      acquiredAtLevel: 4,
    });
    const r = await app.inject({
      method: 'PUT',
      url: `/characters/${x.id}/effects/${g.json().id}/ability-boosts/benefit-1`,
      headers: { origin, cookie: x.cookie },
      payload: { abilities: ['intelligence', 'intelligence'] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ effective: { wisdom: 14, intelligence: 18 } });
    expect(db.prepare('SELECT count(*) n FROM character_ability_boost').get()).toEqual({ n: 1 });
  });
  it('bloqueia mudança de base que tornaria o bônus excedente e mantém transação', async () => {
    const x = await setup();
    await x.put(['intelligence', 'intelligence']);
    const response = await app.inject({
      method: 'PATCH',
      url: `/characters/${x.id}`,
      headers: { origin, cookie: x.cookie },
      payload: { attributes: { ...character().attributes, intelligence: 20 } },
    });
    expect(response.statusCode).toBe(400);
    expect(
      db.prepare('SELECT intelligence FROM dnd_character WHERE character_id=?').get(x.id)
    ).toEqual({ intelligence: 16 });
  });
  it('confere contexto explícito de campanha e não adivinha o cenário', async () => {
    const x = await setup('actor');
    // Synthetic catalog rule isolates the evaluator; it is not presented as an official feat.
    db.prepare("UPDATE lib_feat SET data=json_set(data,'$.prereq',json(?)) WHERE id=?").run(
      JSON.stringify({ text: 'test campaign', all: [[{ kind: 'campaign', setting: 'Eberron' }]] }),
      localId('feat', 'actor')
    );
    const report = () =>
      app.inject({ url: `/characters/${x.id}/validation`, headers: { cookie: x.cookie } });
    const state = async () =>
      (await report())
        .json()
        .findings.find(
          (f: { code: string; entityId: number }) =>
            f.code === 'FEAT_PREREQUISITES' && f.entityId === x.featId
        ).state;
    expect(await state()).toBe('unknown');
    const patch = (campaignSetting: string) =>
      app.inject({
        method: 'PATCH',
        url: `/characters/${x.id}`,
        headers: { origin, cookie: x.cookie },
        payload: { campaignSetting },
      });
    expect((await patch('Eberron')).statusCode).toBe(200);
    expect(await state()).toBe('pass');
    await patch('Greyhawk');
    expect(await state()).toBe('fail');
  });
  it('rejeita benefícios fixos inventados na rota estrita', async () => {
    const x = await setup('actor');
    const bad = await x.post(`/characters/${x.id}/effects/${x.grantId}/benefits`, {
      kind: 'skill',
      localId: localId('skill', 'skill-arcana'),
      selectionKind: 'fixed',
      proficiencyRank: 1,
    });
    expect(bad.statusCode).toBe(400);
    expect(db.prepare('SELECT count(*) n FROM character_skill').get()).toEqual({ n: 0 });
  });
  it('aplica teto 30 explicitamente declarado sem reduzir a base', async () => {
    const x = await setup('boon-of-blazing-dawn', { intelligence: 29 });
    expect((await x.put(['intelligence'])).json()).toMatchObject({
      effective: { intelligence: 30 },
    });
  });
  it('mantém dependência circular entre talentos inconclusiva', async () => {
    const x = await setup('actor');
    const existing = db
      .prepare('SELECT grant_id FROM character_ability WHERE id=?')
      .get(x.featId) as { grant_id: number };
    const second = await x.post(`/characters/${x.id}/benefits`, {
      kind: 'feat',
      localId: localId('feat', 'resilient'),
      grantId: existing.grant_id,
      selectionKind: 'fixed',
    });
    expect(second.statusCode).toBe(201);
    for (const [slug, required] of [
      ['actor', 'resilient'],
      ['resilient', 'actor'],
    ])
      db.prepare("UPDATE lib_feat SET data=json_set(data,'$.prereq',json(?)) WHERE id=?").run(
        JSON.stringify({ text: 'synthetic cycle', all: [[{ kind: 'feat', feat: required }]] }),
        localId('feat', slug!)
      );
    const r = await app.inject({
      url: `/characters/${x.id}/validation`,
      headers: { cookie: x.cookie },
    });
    const states = r
      .json()
      .findings.filter((f: { code: string }) => f.code === 'FEAT_PREREQUISITES')
      .map((f: { state: string }) => f.state);
    expect(states).toEqual(['unknown', 'unknown']);
  });
  it('limita acesso e rejeita bônus de concessão alheia', async () => {
    const x = await setup();
    expect((await app.inject(`/characters/${x.id}/effects`)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/characters/${x.id}/effects/999999/ability-boosts/benefit-1`,
          headers: { origin, cookie: x.cookie },
          payload: { abilities: ['wisdom'] },
        })
      ).statusCode
    ).toBe(400);
  });
  it('retorna proficiências fixas de classe sem gravar cópias', async () => {
    const x = await setup();
    const r = await app.inject({
      url: `/characters/${x.id}/effects`,
      headers: { cookie: x.cookie },
    });
    expect(r.json().projected.savingThrows).toEqual(
      expect.arrayContaining(['intelligence', 'wisdom'])
    );
    expect(db.prepare('SELECT count(*) n FROM character_saving_throw').get()).toEqual({ n: 0 });
  });
  it('exige confirmação ao excluir bônus dependentes e remove em cascata', async () => {
    const x = await setup();
    await x.put(['constitution', 'constitution']);
    const preview = await app.inject({
      method: 'POST',
      url: `/characters/${x.id}/benefits/feat/${x.featId}/removal-preview`,
      headers: { origin, cookie: x.cookie },
    });
    expect(preview.statusCode).toBe(200);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/characters/${x.id}/benefits/feat/${x.featId}?confirmationToken=${preview.json().confirmationToken}`,
      headers: { origin, cookie: x.cookie },
    });
    expect(removed.statusCode).toBe(204);
    expect(db.prepare('SELECT count(*) n FROM character_ability_boost').get()).toEqual({ n: 0 });
  });
});
