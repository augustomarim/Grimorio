import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as rulesData from '@freshmag/one-dndb/data';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { openDatabase, type Database } from '../../src/db/database.js';
import { loadConfig } from '../../src/config.js';
import { importCatalog } from '../../src/catalog/import.js';
import type { Mail } from '../../src/auth/mail.js';
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const origin = 'http://localhost:3000',
  password = 'test-password-with-24-characters';
const schema = 'test_' + randomUUID().replaceAll('-', '');
let admin: Database;
let app: FastifyInstance, db: Database, cookie: string, id: number, cc: number;
const messages: Mail[] = [];
async function local(kind: string, slug: string) {
  return (
    await db
      .prepare(
        `SELECT l.id FROM lib_${kind} l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE e.kind=? AND e.slug=?`
      )
      .get(kind, slug)
  ).id as number;
}
const post = (path: string, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: path,
    headers: { origin, ...(cookie ? { cookie } : {}) },
    payload,
  });
suite('PostgreSQL 17 real — integração do backend', () => {
  beforeAll(async () => {
    admin = openDatabase(url!);
    await admin.exec('CREATE SCHEMA ' + schema);
    const connection = new URL(url!);
    connection.searchParams.set('options', '-c search_path=' + schema + ',public');
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: connection.toString(),
      AUTH_KEY: 'test-only-postgres-key-with-32-characters',
      APP_ORIGIN: origin,
    });
    const built = await buildApp({
      config,
      mailer: {
        send: async (mail) => {
          messages.push(mail);
        },
      },
    });
    app = built.app;
    db = built.db;
    await importCatalog(db);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (admin) {
      await admin.exec('DROP SCHEMA ' + schema + ' CASCADE');
      await admin.close();
    }
  });
  it('usa PostgreSQL, aplica migração e importa todo o catálogo', async () => {
    const r = await app.inject('/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      databaseEngine: 'postgresql',
      schemaVersion: 2,
      catalogEntries: 1905,
    });
  });
  it('cadastra e autentica por HTTP sem enviar e-mail', async () => {
    let r = await post('/auth/register', {
      email: 'pg-owner@example.invalid',
      username: 'pg-owner',
      password,
    });
    expect(r.statusCode).toBe(202);
    expect(messages).toHaveLength(0);
    r = await post('/auth/login', { email: 'PG-OWNER@example.invalid', password });
    expect(r.statusCode).toBe(200);
    cookie = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  });
  it('cria personagem com atributos, narrativa e classe', async () => {
    const r = await post('/characters', {
      name: 'Ari PostgreSQL',
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
      backgroundId: await local('background', 'criminal'),
      classes: [{ classId: await local('class', 'wizard'), level: 1, initial: true }],
      narrative: { backstory: 'Teste PostgreSQL' },
    });
    expect(r.statusCode, r.body).toBe(201);
    id = r.json().id;
    cc = (await db.prepare('SELECT id FROM character_class WHERE character_id=?').get(id)).id;
  });
  it('salva, reabre, edita e publica uma ficha com escolhas aninhadas', async () => {
    const root = new URL('../../../frontend/', import.meta.url);
    const read = (file: string) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    const { indexCatalog, newCharacter, projectCharacter } = await import(
      new URL('rules.js', root).href
    );
    const catalog = indexCatalog(
      { ...rulesData, revision: rulesData.REVISION, languagePick: rulesData.reference.languagePick },
      read('pt-BR.json'),
      read('reference.json')
    );
    const replace = 'class/warlock/replace-invocation/2';
    const pact = `${replace}/Armor of Shadows/replacement/Pact of the Tome`;
    const draft = {
      ...newCharacter(randomUUID()),
      name: 'Bruxo do Tomo',
      species: 'human',
      background: 'soldier',
      class: 'warlock',
      level: 2,
      saved: true,
      play: { damage: 3, temporaryHP: 2, slots: { pact: 1 }, hitDice: { 8: 1 } },
      selected: {
        'class/warlock/invocation/1': ['Armor of Shadows'],
        'class/warlock/invocation/2': ['Devil’s Sight'],
        'class/warlock/invocation/3': ['Eldritch Mind'],
        [replace]: ['Armor of Shadows'],
        [`${replace}/Armor of Shadows/replacement`]: ['Pact of the Tome'],
      } as Record<string, string[]>,
    };
    for (let pass = 0; pass < 30; pass++) {
      const projection = projectCharacter(draft, catalog);
      if (!projection.pending.length) {
        draft.selected = projection.validSelections;
        break;
      }
      for (const group of projection.groups) {
        if (projection.pending.includes(group.key))
          draft.selected[group.key] = [
            ...group.selected,
            ...group.options
              .filter(({ id }: { id: string }) => !group.selected.includes(id))
              .slice(0, group.count - group.selected.length)
              .map(({ id }: { id: string }) => id),
          ];
      }
    }
    const projection = projectCharacter(draft, catalog);
    expect(projection.pending).toEqual([]);
    expect(draft.selected[`${pact}/spell/tome-cantrips`]).toHaveLength(3);
    expect(projection.spells.some(({ id }: { id: string }) => id === 'mage-armor')).toBe(false);
    const url = `/builder/${draft.id}`;
    const publicUrl = `/builder/public/${draft.id}`;
    const put = (session: string, revision: number, isPublic: boolean) =>
      app.inject({
        method: 'PUT',
        url,
        headers: { origin, cookie: session },
        payload: { draft, revision, isPublic },
      });
    const saved = await put(cookie, 0, false);
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await app.inject(publicUrl)).statusCode).toBe(404);
    const gallery = async () => {
      const response = await app.inject('/builder/public');
      expect(response.statusCode, response.body).toBe(200);
      return response.json().documents;
    };
    expect(await gallery()).toEqual([]);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin },
      payload: { email: 'pg-owner@example.invalid', password },
    });
    expect(login.statusCode, login.body).toBe(200);
    const session = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
    const reopened = await app.inject({ url, headers: { cookie: session } });
    expect(reopened.statusCode, reopened.body).toBe(200);
    expect(reopened.json().draft.selected).toEqual(draft.selected);
    expect(reopened.json().draft.play).toEqual(draft.play);
    draft.notes = 'Edição feita na segunda sessão';
    const edited = await put(session, reopened.json().revision, false);
    expect(edited.statusCode, edited.body).toBe(200);
    expect((await put(cookie, reopened.json().revision, false)).statusCode).toBe(409);
    const published = await put(session, edited.json().revision, true);
    expect(published.statusCode, published.body).toBe(200);
    const shared = await app.inject(publicUrl);
    expect(shared.statusCode, shared.body).toBe(200);
    expect(shared.json().draft).toMatchObject({ notes: draft.notes, selected: draft.selected });
    expect(shared.json().draft).not.toHaveProperty('play');
    expect(await gallery()).toEqual([
      { id: draft.id, name: draft.name, class: 'warlock', classPlan: null, level: 2 },
    ]);
    const privateAgain = await put(session, published.json().revision, false);
    expect(privateAgain.statusCode, privateAgain.body).toBe(200);
    expect((await app.inject(publicUrl)).statusCode).toBe(404);
    expect(await gallery()).toEqual([]);
  });
  it('consulta ficha e cálculos sem expor personagem privado', async () => {
    expect((await app.inject(`/characters/${id}`)).statusCode).toBe(404);
    const r = await app.inject({ url: `/characters/${id}/derived`, headers: { cookie } });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      proficiencyBonus: 2,
      armorClass: { value: 12 },
      hitPoints: { modeledMaximum: 8 },
    });
  });
  it('busca catálogo e galeria com parâmetros nulos', async () => {
    for (const path of [
      '/catalog/spell',
      '/catalog/spell?q=fire',
      '/characters/mine',
      '/characters/mine?q=ari',
      '/characters/public',
    ]) {
      const r = await app.inject({ url: path, headers: { cookie } });
      expect(r.statusCode, r.body).toBe(200);
    }
  });
  it('grava duas instâncias de inventário e filtra sem perder dados', async () => {
    for (let i = 0; i < 2; i++) {
      const r = await post(`/characters/${id}/items`, {
        itemId: await local('item', 'dagger'),
        quantity: 1,
        equipped: false,
      });
      expect(r.statusCode, r.body).toBe(201);
    }
    const r = await app.inject({
      url: `/characters/${id}/items?equipped=false`,
      headers: { cookie },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().total).toBe(2);
  });
  it('registra concessão, talento e bônus separado', async () => {
    let r = await post(`/characters/${id}/grants`, {
      originKind: 'class',
      originId: cc,
      acquisitionContext: 'initial_class',
      ruleKey: 'test-draft',
      acquiredAtLevel: 1,
    });
    expect(r.statusCode, r.body).toBe(201);
    r = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: await local('feat', 'actor'),
      grantId: r.json().id,
      selectionKind: 'fixed',
    });
    expect(r.statusCode, r.body).toBe(201);
    r = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: r.json().id,
      acquisitionContext: 'feat',
      ruleKey: 'test-boost',
      acquiredAtLevel: 1,
    });
    expect(r.statusCode, r.body).toBe(201);
    r = await app.inject({
      method: 'PUT',
      url: `/characters/${id}/effects/${r.json().id}/ability-boosts/ability-score-increase`,
      headers: { origin, cookie },
      payload: { abilities: ['charisma'] },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().effective.charisma).toBe(15);
  });
  it('executa relatório de validação e escolhas', async () => {
    for (const path of [
      'validation',
      'effects',
      'casting',
      'class-benefits',
      'benefits/options',
      'choices',
    ]) {
      const r = await app.inject({ url: `/characters/${id}/${path}`, headers: { cookie } });
      expect(r.statusCode, r.body).toBe(200);
    }
  });
  it('rotaciona refresh e invalida cookie anterior', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin, cookie },
    });
    expect(r.statusCode, r.body).toBe(200);
    const next = r.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect((await app.inject({ url: '/auth/me', headers: { cookie } })).statusCode).toBe(401);
    cookie = next;
  });
  it('confere checks, subclasse incompatível e rollback real', async () => {
    await expect(
      db.prepare('UPDATE character_class SET level=21 WHERE id=?').run(cc)
    ).rejects.toMatchObject({ code: '23514' });
    const wrong = await local('subclass', 'assassin');
    await expect(
      db.prepare('UPDATE character_class SET subclass_id=? WHERE id=?').run(wrong, cc)
    ).rejects.toMatchObject({ code: '23503' });
    const before = await db.prepare('SELECT count(*) n FROM audit_log').get();
    await expect(
      db
        .transaction(async () => {
          await db
            .prepare("INSERT INTO audit_log(action,entity_type) VALUES('rollback-test','test')")
            .run();
          throw new Error('expected rollback');
        })
        .immediate()
    ).rejects.toThrow('expected rollback');
    expect(await db.prepare('SELECT count(*) n FROM audit_log').get()).toEqual(before);
  });
  it('prévia executa e reverte alterações usando savepoints', async () => {
    const r = await post(`/characters/${id}/changes/preview`, { name: 'preview only' });
    expect(r.statusCode, r.body).toBe(200);
    expect((await db.prepare('SELECT name FROM character WHERE id=?').get(id)).name).toBe(
      'Ari PostgreSQL'
    );
    const patch = await app.inject({
      method: 'PATCH',
      url: `/characters/${id}`,
      headers: { origin, cookie },
      payload: { name: 'Ari atualizado' },
    });
    expect(patch.statusCode, patch.body).toBe(200);
  });
  it('publica personagem e permite galeria pública', async () => {
    const r = await post(`/characters/${id}/publish`, {});
    expect(r.statusCode, r.body).toBe(204);
    expect((await app.inject(`/characters/${id}`)).statusCode).toBe(200);
  });
  it('executa magias, grimório e remoção de inventário', async () => {
    const spellId = await local('spell', 'magic-missile');
    let r = await post(`/characters/${id}/spellbook`, { spellId, characterClassId: cc });
    expect(r.statusCode, r.body).toBe(201);
    r = await post(`/characters/${id}/spells`, {
      spellId,
      originKind: 'class',
      originId: cc,
      preparationMode: 'selectable',
      isPrepared: true,
    });
    expect(r.statusCode, r.body).toBe(201);
    for (const path of ['spells', 'spellbook'])
      expect(
        (await app.inject({ url: `/characters/${id}/${path}`, headers: { cookie } })).statusCode
      ).toBe(200);
    const items = await app.inject({ url: `/characters/${id}/items`, headers: { cookie } });
    const item = items.json().items[0];
    r = await app.inject({
      method: 'DELETE',
      url: `/characters/${id}/items/${item.id}`,
      headers: { origin, cookie },
    });
    expect(r.statusCode, r.body).toBe(204);
    expect(
      (await db.prepare('SELECT count(*) n FROM character_item WHERE character_id=?').get(id)).n
    ).toBe(1);
  });
  it('serializa escritas concorrentes sem perder atualização', async () => {
    await db.exec(
      'CREATE TABLE concurrent_test(id integer primary key,value integer not null);INSERT INTO concurrent_test VALUES(1,0)'
    );
    await Promise.all(
      [1, 2].map(() =>
        db
          .transaction(async () => {
            const row = await db.prepare('SELECT value FROM concurrent_test WHERE id=1').get();
            await new Promise((resolve) => setTimeout(resolve, 20));
            await db.prepare('UPDATE concurrent_test SET value=? WHERE id=1').run(row.value + 1);
          })
          .immediate()
      )
    );
    expect((await db.prepare('SELECT value FROM concurrent_test WHERE id=1').get()).value).toBe(2);
  });

  it('mantém multiclasse 3 + 4 + 3 e total derivado 10', async () => {
    const r = await post('/characters', {
      name: 'Multiclasse PG',
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
      classes: [
        { classId: await local('class', 'wizard'), level: 3, initial: true },
        { classId: await local('class', 'cleric'), level: 4, initial: false },
        { classId: await local('class', 'sorcerer'), level: 3, initial: false },
      ],
    });
    expect(r.statusCode, r.body).toBe(201);
    const other = r.json().id;
    const summary = await app.inject({ url: `/characters/${other}/derived`, headers: { cookie } });
    expect(summary.statusCode, summary.body).toBe(200);
    expect(summary.json()).toMatchObject({
      totalLevel: 10,
      proficiencyBonus: 4,
      hitPoints: { historyComplete: false, modeledMaximum: null },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/characters/${other}`,
      headers: { origin, cookie },
    });
    expect(removed.statusCode, removed.body).toBe(204);
    expect(
      (await db.prepare('SELECT count(*) n FROM character_class WHERE character_id=?').get(other)).n
    ).toBe(0);
  });
  it('preserva escolha aninhada de magia e atributo de conjuração', async () => {
    const parent = await db
      .prepare(
        "SELECT id FROM character_rule_grant WHERE character_id=? AND origin_kind='class' LIMIT 1"
      )
      .get(id);
    let r = await post(`/characters/${id}/benefits`, {
      kind: 'feat',
      localId: await local('feat', 'magic-initiate'),
      grantId: parent.id,
      selectionKind: 'fixed',
    });
    expect(r.statusCode, r.body).toBe(201);
    const featId = r.json().id;
    r = await post(`/characters/${id}/grants`, {
      originKind: 'feat',
      originId: featId,
      acquisitionContext: 'feat',
      ruleKey: 'magic-initiate-test',
      acquiredAtLevel: 1,
    });
    expect(r.statusCode, r.body).toBe(201);
    r = await post(`/characters/${id}/choices`, {
      grantId: r.json().id,
      choiceId: 'app:magic-initiate',
      optionId: 'wizard:intelligence',
    });
    expect(r.statusCode, r.body).toBe(201);
    r = await post(`/characters/${id}/spells`, {
      spellId: await local('spell', 'light'),
      originKind: 'feat',
      originId: featId,
      preparationMode: 'cantrip',
      choiceInstanceId: r.json().id,
      nestedChoiceKey: 'spellChoices:two-cantrips',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(
      (
        await db
          .prepare('SELECT casting_ability_choice FROM character_spell WHERE id=?')
          .get(r.json().id)
      ).casting_ability_choice
    ).toBe('intelligence');
    const benefits = await app.inject({ url: `/characters/${id}/benefits`, headers: { cookie } });
    expect(benefits.statusCode, benefits.body).toBe(200);
    expect(benefits.json().items[0]).toHaveProperty('grantId');
  });
  it('duas renovações simultâneas não criam sucessores válidos independentes', async () => {
    const responses = await Promise.all(
      [1, 2].map(() =>
        app.inject({ method: 'POST', url: '/auth/refresh', headers: { origin, cookie } })
      )
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const success = responses.find((r) => r.statusCode === 200)!;
    const replayedCookie = success.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect(
      (await app.inject({ url: '/auth/me', headers: { cookie: replayedCookie } })).statusCode
    ).toBe(401);
  });
});
