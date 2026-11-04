/** Fluxo HTTP real, isolado. Não lê .env nem toca no banco/configuração do usuário. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildApp } from '../dist/app.js';
import { importCatalog } from '../dist/catalog/import.js';

const temporary = await mkdtemp(join(tmpdir(), 'grimorio-e2e-'));
const mailDirectory = join(temporary, 'mail');
const origin = 'http://127.0.0.1:3000';
const email = 'owner@example.invalid';
const password = randomBytes(24).toString('base64url');
const newPassword = randomBytes(24).toString('base64url');
const report = { status: 'running', transport: 'HTTP real em porta temporária', steps: [] };
let app, db, base;
class Browser {
  cookies = new Map();
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  clone() {
    const copy = new Browser();
    copy.cookies = new Map(this.cookies);
    return copy;
  }
  receive(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        separator = pair.indexOf('=');
      const key = pair.slice(0, separator),
        value = pair.slice(separator + 1);
      if (value) this.cookies.set(key, value);
      else this.cookies.delete(key);
    }
  }
}
async function request(label, method, path, expected, { body, browser, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      origin,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(browser?.header() ? { cookie: browser.header() } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const step = {
    label,
    method,
    path,
    expected,
    actual: response.status,
    passed: response.status === expected,
  };
  report.steps.push(step);
  // Nunca imprime payload, resposta completa, cookies, senha ou token.
  assert.equal(
    response.status,
    expected,
    `${label}: esperado HTTP ${expected}, recebido ${response.status}; código ${data?.error?.code ?? 'sem código'}`
  );
  browser?.receive(response);
  console.log(`OK ${String(report.steps.length).padStart(2, '0')} — ${label} (${expected})`);
  return data;
}
async function deliveredToken(to, purpose) {
  const candidates = [];
  for (const name of await readdir(mailDirectory)) {
    const message = JSON.parse(await readFile(join(mailDirectory, name), 'utf8'));
    if (message.to === to && message.purpose === purpose) candidates.push(message);
  }
  assert.equal(candidates.length, 1, 'Entrega local de teste ausente ou ambígua');
  return candidates[0].token;
}
async function register(to, username) {
  return request(`Cadastro de ${username}`, 'POST', '/auth/register', 202, {
    body: { email: to, username, password },
  });
}
async function login(browser, to = email, chosenPassword = password, expected = 200) {
  return request('Login', 'POST', '/auth/login', expected, {
    browser,
    body: { email: to, password: chosenPassword },
  });
}
async function option(kind, slug, q) {
  const page = await request(`Consulta de ${kind}`, 'GET', `/catalog/${kind}?q=${q}`, 200);
  const result = page.items.find((item) => item.slug === slug);
  assert.ok(result?.localId, 'Opção real do catálogo não encontrada');
  return result;
}
try {
  const resources = await buildApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      databasePath: join(temporary, 'test.db'),
      origin,
      authKey: randomBytes(32).toString('hex'),
      mailMode: 'file',
      mailDirectory,
    },
  });
  app = resources.app;
  db = resources.db;
  report.catalog = await importCatalog(db);
  base = await app.listen({ host: '127.0.0.1', port: 0 });
  console.log('Verificação isolada: servidor, banco, chaves e e-mails temporários.');
  const health = await request('Saúde da API', 'GET', '/health', 200);
  assert.equal(health.status, 'ok');
  assert.equal(health.schemaVersion, 4);
  assert.equal(health.catalogEntries, 1905);
  report.health = health;
  await request('Sistemas habilitados', 'GET', '/systems', 200);
  await request('Fontes bibliográficas', 'GET', '/sources', 200);
  const human = await option('species', 'human', 'Human');
  const wizard = await option('class', 'wizard', 'Wizard');
  const cleric = await option('class', 'cleric', 'Cleric');
  const sorcerer = await option('class', 'sorcerer', 'Sorcerer');
  await request('Detalhe do catálogo', 'GET', `/catalog/class/${wizard.id}`, 200);
  await request('Origem incorreta é rejeitada', 'POST', '/auth/register', 403, {
    body: { email, username: 'owner', password },
    headers: { origin: 'https://other.invalid' },
  });
  const malformed = await fetch(base + '/auth/register', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { origin, 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  report.steps.push({
    label: 'JSON inválido retorna 400, não 500',
    method: 'POST',
    path: '/auth/register',
    expected: 400,
    actual: malformed.status,
    passed: true,
  });
  console.log(
    `OK ${String(report.steps.length).padStart(2, '0')} — JSON inválido retorna 400, não 500 (400)`
  );
  await register(email, 'owner');
  const duplicate = await register(email, 'owner');
  assert.ok(duplicate.message);
  assert.equal(db.prepare('SELECT count(*) AS n FROM app_user').get().n, 1);
  const owner = new Browser();
  const logged = await login(owner);
  assert.equal('access' in logged || 'refresh' in logged, false, 'Token não deve aparecer no JSON');
  assert.ok(
    db
      .prepare('SELECT password_hash FROM app_user WHERE id=1')
      .get()
      .password_hash.startsWith('$argon2id$')
  );
  await request('Sessão guardada automaticamente', 'GET', '/auth/me', 200, { browser: owner });
  const basic = {
    name: 'Ficha automatizada',
    systemCode: 'dnd-2024',
    speciesId: human.localId,
    attributes: {
      strength: 10,
      dexterity: 14,
      constitution: 14,
      intelligence: 16,
      wisdom: 14,
      charisma: 14,
    },
    classes: [{ classId: wizard.localId, level: 1, initial: true }],
    narrative: { backstory: 'História de teste' },
  };
  const sheet = await request('Criar ficha privada', 'POST', '/characters', 201, {
    browser: owner,
    body: basic,
  });
  assert.equal(sheet.total_level, 1);
  assert.equal(sheet.hitPoints.base_hit_points, 8);
  assert.equal(sheet.validation.rulesVerified, false);
  const dagger = await option('item', 'dagger', 'Dagger');
  const firstItem = await request(
    'Adicionar item ao inventário',
    'POST',
    `/characters/${sheet.id}/items`,
    201,
    {
      browser: owner,
      body: { itemId: dagger.localId, quantity: 2, equipped: true, notes: 'Principal' },
    }
  );
  const secondItem = await request(
    'Adicionar outra instância do mesmo item',
    'POST',
    `/characters/${sheet.id}/items`,
    201,
    { browser: owner, body: { itemId: dagger.localId, notes: 'Reserva' } }
  );
  assert.notEqual(firstItem.id, secondItem.id);
  const inventory = await request(
    'Inventário paginado',
    'GET',
    `/characters/${sheet.id}/items?limit=1`,
    200,
    { browser: owner }
  );
  assert.equal(inventory.total, 2);
  assert.equal(inventory.items.length, 1);
  await request(
    'Inventário privado não vaza para visitante',
    'GET',
    `/characters/${sheet.id}/items`,
    404
  );
  await request('Quantidade zero é rejeitada', 'POST', `/characters/${sheet.id}/items`, 400, {
    browser: owner,
    body: { itemId: dagger.localId, quantity: 0 },
  });
  const changedItem = await request(
    'Alterar quantidade e equipamento preservando notas',
    'PATCH',
    `/characters/${sheet.id}/items/${firstItem.id}`,
    200,
    { browser: owner, body: { quantity: 3, equipped: false } }
  );
  assert.equal(changedItem.quantity, 3);
  assert.equal(changedItem.equipped, false);
  assert.equal(changedItem.notes, 'Principal');
  const unequipped = await request(
    'Filtrar itens não equipados',
    'GET',
    `/characters/${sheet.id}/items?equipped=false`,
    200,
    { browser: owner }
  );
  assert.equal(unequipped.total, 2);

  await request('Visitante não consulta ficha privada', 'GET', `/characters/${sheet.id}`, 404);
  await register('other@example.invalid', 'other');
  const other = new Browser();
  await login(other, 'other@example.invalid');
  await request('Outro dono não pode editar', 'PATCH', `/characters/${sheet.id}`, 404, {
    browser: other,
    body: { name: 'Não permitido' },
  });
  await request(
    'Outro dono não altera instância de inventário',
    'PATCH',
    `/characters/${sheet.id}/items/${firstItem.id}`,
    404,
    { browser: other, body: { quantity: 99 } }
  );
  await request(
    'Publicação exige confirmar e-mail',
    'POST',
    `/characters/${sheet.id}/publish`,
    403,
    { browser: owner }
  );
  const verification = await deliveredToken(email, 'email_verification');
  await request(
    'Confirmar e-mail automaticamente',
    'POST',
    '/auth/email-verification/confirm',
    204,
    { body: { token: verification } }
  );
  await request(
    'Confirmação não pode ser reutilizada',
    'POST',
    '/auth/email-verification/confirm',
    400,
    { body: { token: verification } }
  );
  await request('Publicar ficha confirmada', 'POST', `/characters/${sheet.id}/publish`, 204, {
    browser: owner,
  });
  await request('Visitante consulta ficha pública', 'GET', `/characters/${sheet.id}`, 200);
  const publicInventory = await request(
    'Inventário acompanha a ficha pública',
    'GET',
    `/characters/${sheet.id}/items`,
    200
  );
  assert.equal(publicInventory.total, 2);
  const gallery = await request('Galeria pública', 'GET', '/characters/public', 200);
  assert.equal(gallery.total, 1);
  const edited = await request(
    'Editar narrativa preservando os outros campos',
    'PATCH',
    `/characters/${sheet.id}`,
    200,
    { browser: owner, body: { narrative: { goals: 'Objetivo de teste' } } }
  );
  assert.equal(edited.narrative.backstory, 'História de teste');
  assert.equal(edited.narrative.goals, 'Objetivo de teste');
  // Provisionamento do administrador SOMENTE no banco temporário de preparação do teste.
  await register('admin@example.invalid', 'administrator');
  db.prepare("UPDATE app_user SET role='admin' WHERE email='admin@example.invalid'").run();
  const admin = new Browser();
  await login(admin, 'admin@example.invalid');
  await request(
    'Administrador modera publicação',
    'POST',
    `/admin/characters/${sheet.id}/hide`,
    204,
    { browser: admin }
  );
  await request('Moderação retira acesso público', 'GET', `/characters/${sheet.id}`, 404);
  await request(
    'Moderação retira acesso público ao inventário',
    'GET',
    `/characters/${sheet.id}/items`,
    404
  );
  await request(
    'Administrador consulta inventário moderado',
    'GET',
    `/characters/${sheet.id}/items`,
    200,
    { browser: admin }
  );
  await request(
    'Administrador não exclui item de outro dono',
    'DELETE',
    `/characters/${sheet.id}/items/${firstItem.id}`,
    404,
    { browser: admin }
  );
  await request('Dono não contorna moderação', 'POST', `/characters/${sheet.id}/publish`, 403, {
    browser: owner,
  });
  await request('Administrador consulta ficha moderada', 'GET', `/characters/${sheet.id}`, 200, {
    browser: admin,
  });
  await request(
    'Administrador libera publicação',
    'POST',
    `/admin/characters/${sheet.id}/unblock-publication`,
    204,
    { browser: admin }
  );
  await request('Liberação não republica automaticamente', 'GET', `/characters/${sheet.id}`, 404);
  await request('Dono republica após liberação', 'POST', `/characters/${sheet.id}/publish`, 204, {
    browser: owner,
  });
  const old = owner.clone();
  await request('Renovação e rotação automáticas', 'POST', '/auth/refresh', 200, {
    browser: owner,
  });
  await request('Access anterior é invalidado', 'GET', '/auth/me', 401, { browser: old });
  await request('Reutilização de refresh é rejeitada', 'POST', '/auth/refresh', 401, {
    browser: old,
  });
  await request('Reutilização revoga a família', 'GET', '/auth/me', 401, { browser: owner });
  await request('Outra conta não é afetada', 'GET', '/auth/me', 200, { browser: other });
  await login(owner);
  await request('Logout em todos os dispositivos', 'POST', '/auth/logout-all', 204, {
    browser: owner,
  });
  await request('Logout global revoga a sessão', 'GET', '/auth/me', 401, { browser: owner });
  await login(owner);
  const resetResponse = await request(
    'Solicitar recuperação',
    'POST',
    '/auth/password-reset/request',
    202,
    { body: { email } }
  );
  const unknownResponse = await request(
    'Endereço desconhecido recebe a mesma resposta',
    'POST',
    '/auth/password-reset/request',
    202,
    { body: { email: 'unknown@example.invalid' } }
  );
  assert.deepEqual(resetResponse, unknownResponse);
  const reset = await deliveredToken(email, 'password_reset');
  await request('Recuperar senha automaticamente', 'POST', '/auth/password-reset/confirm', 204, {
    body: { token: reset, password: newPassword },
  });
  await request('Recuperação revoga sessões existentes', 'GET', '/auth/me', 401, {
    browser: owner,
  });
  await request('Reset é de uso único', 'POST', '/auth/password-reset/confirm', 400, {
    body: { token: reset, password: newPassword },
  });
  await login(new Browser(), email, password, 401);
  await login(owner, email, newPassword);
  const classes = [wizard.localId, cleric.localId, sorcerer.localId].map((classId, index) => ({
    classId,
    level: [3, 4, 3][index],
    initial: index === 0,
  }));
  const progression = classes.flatMap((choice, index) =>
    Array.from({ length: choice.level }, (_, level) => ({
      classId: choice.classId,
      hpMethod: index === 0 && level === 0 ? 'first_max' : 'average',
    }))
  );
  const multiclass = await request('Multiclasse 3 + 4 + 3', 'POST', '/characters', 201, {
    browser: owner,
    body: { ...basic, name: 'Multiclasse automatizada', classes, progression },
  });
  assert.equal(multiclass.total_level, 10);
  assert.equal(multiclass.hitPoints.base_hit_points, 66);
  await request(
    'Evolução sem histórico é rejeitada',
    'PATCH',
    `/characters/${multiclass.id}`,
    400,
    { browser: owner, body: { classes } }
  );
  const unchanged = await request(
    'Falha preserva os níveis anteriores',
    'GET',
    `/characters/${multiclass.id}`,
    200,
    { browser: owner }
  );
  assert.equal(unchanged.total_level, 10);
  await request('Nível total acima de 20 é rejeitado', 'POST', '/characters', 400, {
    browser: owner,
    body: {
      ...basic,
      classes: [
        { classId: wizard.localId, level: 20, initial: true },
        { classId: cleric.localId, level: 1, initial: false },
      ],
    },
  });
  await request('Excluir ficha multiclasse', 'DELETE', `/characters/${multiclass.id}`, 204, {
    browser: owner,
  });
  await request(
    'Excluir apenas uma instância',
    'DELETE',
    `/characters/${sheet.id}/items/${firstItem.id}`,
    204,
    { browser: owner }
  );
  await request(
    'Instância excluída não é consultável',
    'GET',
    `/characters/${sheet.id}/items/${firstItem.id}`,
    404,
    { browser: owner }
  );
  const survivor = await request(
    'Outra instância é preservada',
    'GET',
    `/characters/${sheet.id}/items`,
    200,
    { browser: owner }
  );
  assert.equal(survivor.total, 1);
  assert.equal(survivor.items[0].id, secondItem.id);
  assert.equal(survivor.items[0].notes, 'Reserva');
  await request('Excluir ficha básica', 'DELETE', `/characters/${sheet.id}`, 204, {
    browser: owner,
  });
  const remaining = await request(
    'Nenhuma ficha ficou após exclusão',
    'GET',
    '/characters/mine',
    200,
    { browser: owner }
  );
  assert.equal(remaining.total, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM character_item').get().n, 0);
  assert.ok(db.prepare('SELECT id FROM lib_item WHERE id=?').get(dagger.localId));
  await request('Logout limpa os cookies', 'POST', '/auth/logout', 204, { browser: owner });
  assert.equal(owner.cookies.size, 0);
  await request('Consulta após logout é rejeitada', 'GET', '/auth/me', 401, { browser: owner });
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(db.prepare('SELECT count(*) AS n FROM catalog_entry').get().n, 1905);
  report.status = 'passed';
  report.assertions = 'Níveis, PV, isolamento, senhas com hash, respostas e integridade conferidos';
} catch (error) {
  report.status = 'failed';
  // Erros de assert aqui usam apenas descrições/status; nunca incluem valores de tokens.
  report.failure = error instanceof Error ? error.message : 'Falha não identificada';
  console.error(`FALHOU — ${report.failure}`);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  report.temporaryDataRemoved = true;
  report.finishedAt = new Date().toISOString();
  await mkdir(resolve('reports'), { recursive: true });
  await writeFile(resolve('reports/smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Resultado: ${report.status}; ${report.steps.length} verificações HTTP. Relatório: reports/smoke.json`
  );
}
