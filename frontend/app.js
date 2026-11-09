import {
  abilities,
  displayName,
  indexCatalog,
  newCharacter,
  pointCosts,
  projectCharacter,
} from './rules.js';
import { accountView, authRequest, restoreSession, withSessionLock } from './auth.js';
import {
  escapeHtml as escape,
  normalizeSearch,
  spellCard,
  spellCircle,
  spellDescription,
  spellName,
  spellSubtitle,
} from './spells.js';

const main = document.querySelector('#main');
const spellDialog = document.querySelector('#spell-picker');
const notice = document.querySelector('#notice');
const accountMenu = document.querySelector('#account-menu');
const guestKey = 'grimorio.guest';
const accounts =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel('grimorio-account') : null;
const steps = [
  ['origem', 'Origem'],
  ['atributos', 'Atributos'],
  ['progressao', 'Classe e níveis'],
  ['revisao', 'Revisão'],
  ['ficha', 'Ficha'],
];
let catalog;
let draft;
let projection;
let step;
let noticeTimer;
let user;
let guest = getGuestMode();
let returnTo;
let accountBusy = false;
let accountSync = 0;
let initialized = false;
let catalogRequest;
let catalogError;
let catalogCategory = 'classes';
let catalogFilter = '';
let catalogLimit = 24;
const memory = new Map();
let picker;
const slug = (value) => /^[a-f\d-]{36}$/i.test(value ?? '');
const title = (character) => character.name.trim() || 'Novo personagem';
const link = (section) => `#personagem/${draft.id}/${section}`;
const plus = (n) => (n < 0 ? String(n) : `+${n}`);
const modifier = (n) => Math.floor((n - 10) / 2);
const storagePrefix = () =>
  user ? `grimorio.account.${user.id}.character.` : 'grimorio.character.';
const characterLink = (character) =>
  `#personagem/${character.id}/${character.saved ? 'ficha' : 'origem'}`;

function getGuestMode() {
  try {
    return localStorage.getItem(guestKey) === '1';
  } catch {
    return false;
  }
}

function setGuestMode(value) {
  guest = value;
  try {
    if (value) localStorage.setItem(guestKey, '1');
    else localStorage.removeItem(guestKey);
  } catch {
    // Local mode can still be used in this tab.
  }
}

function read(id) {
  try {
    const value = localStorage.getItem(storagePrefix() + id);
    if (value) return JSON.parse(value);
  } catch {
    // The character can still be used in the open tab.
  }
  return memory.get(id);
}

function write() {
  memory.set(draft.id, draft);
  try {
    localStorage.setItem(storagePrefix() + draft.id, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function showNotice(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.textContent = '';
  }, 3500);
}

function savedCharacters() {
  const entries = new Map(memory);
  const prefix = storagePrefix();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (slug(id)) entries.set(id, read(id));
    }
  } catch {
    // Entries saved in this tab are still available.
  }
  return [...entries.values()]
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function characterList(characters) {
  return `<section class="panel"><header class="section-heading"><h2>Minhas fichas</h2><span>Salvas neste navegador</span></header>
    ${
      characters.length
        ? `<ul class="character-list">${characters
            .map(
              (character) => `<li>
      <a href="${characterLink(character)}">
        <span><strong>${escape(title(character))}</strong><small>
          ${escape(displayName(catalog.byContent.get(character.class) ?? { name: 'Classe a escolher' }))} · Nível ${character.level}
        </small></span><span class="tag">${character.saved ? 'Ficha' : 'Rascunho'}</span></a></li>`
            )
            .join('')}</ul>`
        : '<p class="muted">Você ainda não tem personagens neste navegador.</p>'
    }</section>`;
}

function createLink(style = 'primary') {
  return `<a class="button ${style}" href="#novo" target="_blank" rel="noopener">Criar personagem</a>`;
}

function workspaceNav(page) {
  const tabs = [
    ['inicio', 'Início'],
    ['personagens', 'Personagens'],
    ['compendio', 'Compêndio'],
  ];
  return `<nav class="hub-nav" aria-label="Painel">${tabs
    .map(
      ([id, label]) => `<a href="#${id}" ${id === page ? 'aria-current="page"' : ''}>${label}</a>`
    )
    .join('')}</nav>`;
}

function hubShell(page, content) {
  return `<div class="hub-shell">${workspaceNav(page)}<div class="hub-content">${content}</div></div>`;
}

function home() {
  const characters = savedCharacters();
  const featured = characters[0];
  const entry = featured && projectCharacter(featured, catalog);
  return `<section class="hero hub-hero"><div>
      <p class="eyebrow">Seu painel de aventuras</p><h1>${user ? 'Olá, ' + escape(user.username) : 'Bem-vindo ao Grimório'}</h1>
      <p>Retome uma ficha ou comece seu próximo personagem.</p>
      <div class="hub-actions">${featured ? `<a class="button primary" href="${characterLink(featured)}">Retomar personagem</a>` : ''}
      ${createLink(featured ? 'secondary' : 'primary')}</div></div>
      <div class="hero-edition" aria-hidden="true">D&amp;D <span>2024</span></div></section>
    ${user && !user.emailVerified ? '<p class="panel account-banner">Seu e-mail ainda precisa ser confirmado. <a href="#reenviar">Reenviar confirmação</a></p>' : ''}
    <div class="hub-grid"><div>
      ${
        featured
          ? `<section class="panel hub-feature"><p class="eyebrow">Em destaque</p><h2>${escape(title(featured))}</h2>
        <p class="muted">${[entry.species, entry.cls]
          .filter(Boolean)
          .map((item) => escape(displayName(item)))
          .join(' · ')}
          · Nível ${featured.level}</p>
        <dl class="scores sheet-scores">${abilities
          .map(
            ([id, , label]) => `<div><dt>${label}</dt><dd>${entry.scores[id]}
          <small>${plus(modifier(entry.scores[id]))}</small></dd></div>`
          )
          .join('')}</dl>
        <a href="${characterLink(featured)}">Abrir ficha</a></section>`
          : ''
      }
      ${characterList(characters.slice(0, 4))}
    </div><aside class="panel hub-shortcuts"><h2>Atalhos</h2>
      <a href="#personagens">Ver todas as fichas</a>
      <a href="#compendio/classes">Consultar classes</a>
      <a href="#compendio/magias">Consultar magias</a>
      ${guest ? '<a href="#login">Entrar ou criar conta</a>' : ''}
    </aside></div>`;
}

const compendiumTabs = [
  ['classes', 'Classes'],
  ['species', 'Espécies'],
  ['backgrounds', 'Antecedentes'],
  ['magias', 'Magias'],
  ['feats', 'Talentos'],
];

function compendiumResults() {
  const all = catalogCategory === 'magias' ? catalog.spells : catalog[catalogCategory];
  const query = normalizeSearch(catalogFilter.trim());
  const entries = all.filter((entry) =>
    normalizeSearch(displayName(entry) + ' ' + entry.name).includes(query)
  );
  return `<p class="muted">${entries.length} resultados</p>
    ${entries
      .slice(0, catalogLimit)
      .map(catalogCategory === 'magias' ? spellCard : details)
      .join('')}
    ${entries.length > catalogLimit ? '<button type="button" class="button secondary" data-more>Mostrar mais</button>' : ''}`;
}

function compendium() {
  return `<section class="panel compendium"><h1>Compêndio</h1>
    <nav class="hub-nav" aria-label="Categorias">${compendiumTabs
      .map(
        ([id, label]) =>
          `<a href="#compendio/${id}" ${id === catalogCategory ? 'aria-current="page"' : ''}>${label}</a>`
      )
      .join('')}</nav>
    <div><label for="catalog-search">Buscar no compêndio</label>
      <input id="catalog-search" type="search" value="${escape(catalogFilter)}"></div>
    <div class="compendium-results" id="compendium-results">${compendiumResults()}</div></section>`;
}

function select(field, label, values, selected, extra = '') {
  return `<label for="${escape(field)}">${escape(label)}</label>
    <select name="${escape(field)}" id="${escape(field)}" ${extra}>
      <option value="">Selecione…</option>${values
        .map(
          (option) =>
            `<option value="${escape(option.id)}" ${selected === option.id ? 'selected' : ''}>${escape(displayName(option))}${
              option.source ? ' · ' + escape(option.source) : ''
            }</option>`
        )
        .join('')}</select>`;
}

function details(entry) {
  const original = entry.body ?? entry.summary ?? entry.text;
  const translation =
    entry.translation?.body ?? entry.translation?.summary ?? entry.translation?.text;
  return `<details class="entry"><summary><strong>${escape(displayName(entry))}</strong>
    ${entry.level ? `<span class="tag">Nível ${entry.level}</span>` : ''}</summary>
    ${entry.source ? `<p class="muted">${escape(entry.source)}</p>` : ''}
    ${original ? `<p class="description" lang="${translation ? 'pt-BR' : 'en'}">${escape(translation ?? original)}</p>` : ''}
    ${
      translation && translation !== original
        ? `<details class="spell-original"><summary>Original em inglês</summary>
      <p class="description" lang="en">${escape(original)}</p></details>`
        : ''
    }
    ${entry.prereq?.text ? `<p class="muted">Pré-requisito: ${escape(entry.prereq.text)}</p>` : ''}
    ${
      entry.key
        ? `<div class="feature-note"><label for="${escape(entry.key)}">Registrar escolha ou anotação</label>
      <input id="${escape(entry.key)}" name="feature-note" data-feature="${escape(entry.key)}" maxlength="500"
        value="${escape(draft.featureNotes?.[entry.key])}" placeholder="Ex.: uma opção descrita nesta habilidade"></div>`
        : ''
    }
  </details>`;
}

function choiceBlock(group) {
  const selected = group.selected;
  const single = group.count === 1;
  const available = single
    ? group.options
    : group.options.filter((option) => !selected.includes(option.id));
  const field =
    group.spellPicker && group.options.length
      ? `<button type="button" class="button secondary" id="picker:${escape(group.key)}" data-picker="${escape(group.key)}">
      ${selected.length ? 'Revisar magias' : 'Escolher magias'} <span class="sr-only"> · ${escape(group.name)}</span></button>`
      : group.options.length && (single || selected.length < group.count)
        ? select(
            group.key,
            group.name,
            available,
            single ? selected[0] : undefined,
            `data-group="${escape(group.key)}" data-index="${single ? 0 : selected.length}"`
          )
        : '';
  const chips =
    (!single || group.spellPicker) && selected.length
      ? `<ul class="chips" aria-label="${escape(group.name)}">
    ${selected
      .map((id) => {
        const name = displayName(group.options.find((option) => option.id === id));
        return `<li>${escape(name)} <button type="button" data-remove-group="${escape(group.key)}"
        data-option="${escape(id)}" aria-label="Remover ${escape(name)}">×</button></li>`;
      })
      .join('')}</ul>`
      : '';
  const descriptions = selected
    .map((id) => group.options.find((option) => option.id === id))
    .filter((option) => option?.summary || option?.grants?.length);
  return `<fieldset class="choice ${group.depth ? 'nested' : ''}">
    <legend>${escape(group.source)}${group.section === 'progressao' ? ` · Nível ${group.level}` : ''}</legend>
    <p class="choice-count">${selected.length}/${group.count} escolhidas</p>
    ${group.prompt ? `<p class="muted">${escape(group.prompt)}</p>` : ''}
    ${chips}${field || (group.options.length ? '' : '<p class="muted">Nenhuma opção elegível com as escolhas atuais.</p>')}
    ${descriptions
      .map(
        (option) => `<p class="muted">${escape(option.translation?.summary ?? option.summary)}
      ${(option.grants ?? []).map(({ label, value }) => `<br>${escape(label)} · ${escape(value)}`).join('')}</p>`
      )
      .join('')}
  </fieldset>`;
}

function benefits(section) {
  const features = projection.features.filter((entry) => !section || entry.section === section);
  return features.length
    ? `<section class="benefits"><h3>Características e habilidades</h3>
    ${features.map(details).join('')}</section>`
    : '';
}

function facts() {
  const entries = [
    ...projection.facts,
    { name: 'Perícias proficientes', value: [...projection.skills].join(', ') },
    { name: 'Especializações', value: [...projection.expertise].join(', ') },
    {
      name: 'Ferramentas proficientes',
      value: [...projection.tools].map((id) => catalog.byTool.get(id)?.name ?? id).join(', '),
    },
    {
      name: 'Idiomas',
      value: [...projection.languages]
        .map((id) => catalog.byLanguage.get(id)?.name ?? id)
        .join(', '),
    },
  ].filter(({ value }) => value);
  return `<dl class="facts">${entries
    .map(({ name, value }) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`)
    .join('')}</dl>`;
}

function origin() {
  const campaigns = [
    ...new Set(
      catalog.feats.flatMap((feat) =>
        (feat.prereq?.all ?? [])
          .flat()
          .filter((condition) => condition.kind === 'campaign')
          .map((condition) => condition.setting)
      )
    ),
  ].sort();
  return `<h2>Origem</h2><p class="muted">Espécie, antecedente, idiomas e os benefícios de cada escolha.</p>
    <label for="name">Nome</label><input id="name" name="name" maxlength="100" value="${escape(draft.name)}">
    <div class="fields two">
      <div>${select('species', 'Espécie', catalog.species, draft.species)}</div>
      <div>${select('background', 'Antecedente', catalog.backgrounds, draft.background)}</div>
    </div>
    <div>${select(
      'campaign',
      'Cenário de campanha (opcional)',
      campaigns.map((name) => ({ id: name, name })),
      draft.campaign
    )}</div>
    ${projection.groups
      .filter(({ section }) => section === 'origem')
      .map(choiceBlock)
      .join('')}
    ${benefits('origem')}`;
}

function attributes() {
  const points = Object.values(draft.scores).reduce(
    (sum, score) => sum + (pointCosts[score] ?? 0),
    0
  );
  return `<h2>Atributos</h2><p class="muted">Distribua os valores base. Os aumentos escolhidos são somados na coluna de valor final.</p>
    <div>${select(
      'method',
      'Método',
      [
        { id: 'array', name: 'Conjunto padrão' },
        { id: 'points', name: 'Compra por pontos' },
        { id: 'manual', name: 'Valores rolados' },
      ],
      draft.method
    )}</div>
    ${draft.method === 'points' ? `<p class="muted">Pontos usados: <strong>${points}/27</strong></p>` : ''}
    <div class="scores">${abilities
      .map(
        ([id, , label]) => `<div><label for="score-${id}">${label}</label>
      ${
        draft.method !== 'manual'
          ? `<select name="score-${id}" id="score-${id}">${(draft.method === 'array'
              ? [15, 14, 13, 12, 10, 8]
              : Object.keys(pointCosts).map(Number)
            )
              .map(
                (value) =>
                  `<option ${draft.scores[id] === value ? 'selected' : ''}>${value}</option>`
              )
              .join('')}</select>`
          : `<input name="score-${id}" id="score-${id}" type="number" min="3" max="18" value="${escape(draft.scores[id])}">`
      }
      <small>Final <strong>${projection.scores[id]}</strong> · ${plus(modifier(projection.scores[id]))}</small></div>`
      )
      .join('')}</div>`;
}

function progression() {
  const groups = projection.groups.filter(({ section }) => section === 'progressao');
  const levels = [...new Set(groups.map(({ level }) => level))].sort((a, b) => a - b);
  return `<h2>Classe e níveis</h2><p class="muted">Escolha a classe e avance o nível para liberar habilidades e novas decisões.</p>
    <div class="fields two">
      <div>${select('class', 'Classe', catalog.classes, draft.class)}</div>
      <div><label for="level">Nível planejado</label><select id="level" name="level">${Array.from(
        { length: 20 },
        (_, i) => `<option ${draft.level === i + 1 ? 'selected' : ''}>${i + 1}</option>`
      ).join('')}</select></div>
    </div>
    ${levels
      .map(
        (level) => `<section class="level"><h3>Nível ${level}</h3>
      ${groups
        .filter((group) => group.level === level)
        .map(choiceBlock)
        .join('')}</section>`
      )
      .join('')}
    ${benefits('progressao')}`;
}

function missingChoices() {
  const pending = [];
  if (!draft.name.trim()) pending.push(['origem', 'Nome']);
  if (!projection.species) pending.push(['origem', 'Espécie']);
  if (!projection.background) pending.push(['origem', 'Antecedente']);
  if (!projection.cls) pending.push(['progressao', 'Classe']);
  const scores = Object.values(draft.scores);
  const validArray = [...scores].sort((a, b) => a - b).join(',') === '8,10,12,13,14,15';
  const validPoints =
    scores.every((n) => Object.hasOwn(pointCosts, n)) &&
    scores.reduce((sum, n) => sum + pointCosts[n], 0) <= 27;
  if (
    draft.method === 'array'
      ? !validArray
      : draft.method === 'points'
        ? !validPoints
        : scores.some((n) => !Number.isInteger(n) || n < 3 || n > 18)
  ) {
    pending.push(['atributos', 'Distribuição dos atributos']);
  }
  return [
    ...pending,
    ...projection.groups
      .filter((group) => projection.pending.includes(group.key))
      .map(({ section, source, name }) => [section, `${source} · ${name}`]),
  ];
}

function review() {
  const pending = missingChoices();
  return `<h2>Revisão</h2>
    ${
      pending.length
        ? `<p>Há ${pending.length} escolhas pendentes.</p><ul class="pending">
      ${pending.map(([section, label]) => `<li><a href="${link(section)}">${escape(label)}</a></li>`).join('')}</ul>`
        : '<p>As escolhas disponíveis no construtor estão preenchidas.</p>'
    }
    <p class="muted">Confira também as escolhas e condições descritas no texto das habilidades.</p>
    <button type="submit" class="button primary" ${pending.length ? 'disabled' : ''}>Salvar ficha</button>
    ${facts()}`;
}

function sheet() {
  const scores = abilities
    .map(
      ([id, , name]) => `<div><dt>${name}</dt><dd>${projection.scores[id]}
    <small>${plus(modifier(projection.scores[id]))}</small></dd></div>`
    )
    .join('');
  const choices = projection.groups.filter(({ selected }) => selected.length);
  return `<h2>Ficha do personagem</h2>
    <dl class="scores sheet-scores">${scores}</dl>
    ${facts()}
    ${benefits()}
    ${projection.feats.length ? `<section class="benefits"><h3>Talentos</h3>${projection.feats.map(details).join('')}</section>` : ''}
    ${
      projection.spells.length
        ? `<section class="benefits"><h3>Magias</h3>${projection.spells
            .map(spellCard)
            .join('')}</section>`
        : ''
    }
    ${
      projection.equipment.length
        ? `<section class="benefits"><h3>Equipamento inicial</h3>
      ${projection.equipment
        .map(
          (kit) =>
            `<p><strong>${escape(kit.source)}</strong> · ${escape(
              [
                ...(kit.items ?? []).map(
                  (item) =>
                    `${item.quantity ?? 1}× ${catalog.byItem.get(item.id)?.name ?? catalog.byTool.get(item.id)?.name ?? item.id}`
                ),
                ...(kit.gold ? [`${kit.gold / 100} PO`] : []),
              ].join(', ')
            )}</p>`
        )
        .join('')}</section>`
        : ''
    }
    ${
      choices.length
        ? `<details class="entry"><summary><strong>Escolhas registradas</strong></summary><ul class="pending">
      ${choices.map((group) => `<li>${escape(group.name)} · ${escape(group.selected.map((id) => displayName(group.options.find((option) => option.id === id))).join(', '))}</li>`).join('')}
      </ul></details>`
        : ''
    }
    <label for="notes">Anotações</label><textarea id="notes" name="notes" rows="4" maxlength="10000">${escape(draft.notes)}</textarea>`;
}

function builder() {
  projection = projectCharacter(draft, catalog);
  const contents = {
    origem: origin,
    atributos: attributes,
    progressao: progression,
    revisao: review,
    ficha: sheet,
  };
  const next = steps[steps.findIndex(([id]) => id === step) + 1]?.[0];
  const summary = [
    ['Espécie', projection.species],
    ['Antecedente', projection.background],
    ['Classe', projection.cls],
    ['Subclasse', projection.subclass],
  ];
  return `<a class="back" href="#inicio">← Meus personagens</a>
    <header class="builder-header"><p class="eyebrow">Construtor de personagem</p><h1>${escape(title(draft))}</h1>
      <p class="muted">Nível ${draft.level} · ${draft.saved ? 'Ficha salva' : 'Rascunho'}</p></header>
    <div class="layout">
      <nav class="panel steps" aria-label="Etapas do personagem">${steps
        .map(
          ([id, label], index) =>
            `<a href="${link(id)}" ${id === step ? 'aria-current="step"' : ''}><span>${index + 1}</span> ${label}</a>`
        )
        .join('')}</nav>
      <form class="panel workspace" id="builder-form">${contents[step]()}
        ${next && step !== 'revisao' ? `<a class="button primary continue" href="${link(next)}">Continuar</a>` : ''}
      </form>
      <aside class="panel summary"><h2>Resumo</h2>
        <dl class="facts">${summary.map(([name, entry]) => `<div><dt>${name}</dt><dd>${entry ? escape(displayName(entry)) : '—'}</dd></div>`).join('')}</dl>
        <p class="muted">${missingChoices().length} escolhas pendentes</p>
      </aside>
    </div>`;
}

function setUser(nextUser) {
  if (user?.id !== nextUser?.id) {
    memory.clear();
    draft = undefined;
  }
  user = nextUser;
}

function menu() {
  accountMenu.innerHTML = user
    ? `<span class="account-name"><span class="avatar" aria-hidden="true">${escape(user.username.slice(0, 1).toUpperCase())}</span>
      ${escape(user.username)}</span><button type="button" class="text-button" data-logout>Sair</button>`
    : guest
      ? '<span class="mode-tag">Modo local</span><a href="#login">Entrar</a>'
      : '<span class="mode-tag">D&amp;D 2024</span>';
}

function openHash(hash) {
  history.replaceState(null, '', '/' + hash);
  route();
  main.focus();
}

async function loadCatalog() {
  catalogError = false;
  try {
    const [response, localization] = await Promise.all([
      fetch('/catalog.json'),
      fetch('/pt-BR.json')
        .then((result) => (result.ok ? result.json() : undefined))
        .catch(() => undefined),
    ]);
    if (!response.ok) throw new Error('Catálogo indisponível');
    catalog = indexCatalog(await response.json(), localization);
  } catch {
    catalogError = true;
  } finally {
    catalogRequest = undefined;
    route();
  }
}

function route() {
  if (!initialized) return;
  if (spellDialog.open) spellDialog.close();
  menu();
  const [page, id, section] = location.hash.slice(1).split('/');
  const accountPage =
    location.pathname === '/verify-email'
      ? 'verificar'
      : location.pathname === '/reset-password'
        ? 'redefinir'
        : ['login', 'cadastro', 'recuperar', 'reenviar'].includes(page)
          ? page
          : null;
  if (accountPage) {
    draft = undefined;
    main.innerHTML = accountView(accountPage);
    return;
  }
  if (!user && !guest) {
    if (['personagem', 'novo', 'compendio', 'personagens'].includes(page)) returnTo = location.hash;
    openHash('#login');
    return;
  }
  if (!catalog) {
    main.innerHTML = catalogError
      ? '<section class="panel"><h1>Catálogo indisponível</h1><p>Tente carregar o catálogo novamente.</p><button type="button" class="button secondary" data-retry-catalog>Tentar novamente</button></section>'
      : '<p>Carregando o catálogo…</p>';
    if (!catalogError && !catalogRequest) catalogRequest = loadCatalog();
    return;
  }
  if (page === 'novo') {
    draft = newCharacter(crypto.randomUUID());
    draft.updatedAt = Date.now();
    write();
    history.replaceState(null, '', link('origem'));
    route();
    return;
  }
  if (page === 'personagem' && slug(id)) {
    draft = read(id);
    if (!draft) {
      main.innerHTML =
        '<section class="panel"><h1>Ficha não encontrada</h1><p>Ela pode estar salva em outro navegador.</p><a href="#inicio">Voltar aos personagens</a></section>';
      return;
    }
    step = steps.some(([key]) => key === section) ? section : 'origem';
    main.innerHTML = builder();
    document.title = title(draft) + ' · Grimório';
    return;
  }
  draft = undefined;
  document.title = 'Grimório · D&D 2024';
  if (page === 'personagens') {
    main.innerHTML = hubShell(
      page,
      `<header class="section-heading"><h1>Personagens</h1>${createLink()}</header>
      ${characterList(savedCharacters())}`
    );
  } else if (page === 'compendio') {
    const category = compendiumTabs.some(([key]) => key === id) ? id : 'classes';
    if (catalogCategory !== category) {
      catalogFilter = '';
      catalogLimit = 24;
    }
    catalogCategory = category;
    main.innerHTML = hubShell(page, compendium());
  } else main.innerHTML = hubShell('inicio', home());
}

async function syncSession(initial = false, rerender = true) {
  const epoch = ++accountSync;
  try {
    const nextUser = await restoreSession();
    if (epoch !== accountSync) return;
    const changed = user?.id !== nextUser?.id || user?.emailVerified !== nextUser?.emailVerified;
    setUser(nextUser);
    if (user && guest) setGuestMode(false);
    if (initial || (changed && rerender)) {
      initialized = true;
      route();
    }
  } catch (error) {
    if (epoch !== accountSync || !initial) return;
    initialized = true;
    route();
    const message = document.querySelector('#account-error');
    if (message) message.textContent = error.message;
  }
}

async function submitAccount(form) {
  if (accountBusy) return;
  const view = form.dataset.view;
  const fields = new FormData(form);
  const email = fields.get('email')?.trim();
  const password = fields.get('password');
  const confirmation = fields.get('confirmation');
  const username = fields.get('username')?.trim();
  const message = form.querySelector('#account-error');
  const submit = form.querySelector('button[type="submit"]');
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (confirmation !== null && password !== confirmation) {
    message.textContent = 'As senhas não coincidem.';
    form.elements.confirmation.focus();
    return;
  }
  if (view === 'cadastro' && username.length < 3) {
    message.textContent = 'O nome de usuário precisa ter pelo menos 3 caracteres.';
    form.elements.username.focus();
    return;
  }
  if (['verificar', 'redefinir'].includes(view) && !token) {
    message.textContent = 'Abra o link recebido no e-mail para continuar.';
    return;
  }
  accountBusy = true;
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  message.textContent = '';
  try {
    if (view === 'login') {
      const session = await withSessionLock(() => authRequest('login', { email, password }));
      ++accountSync;
      setUser(session.user);
      setGuestMode(false);
      accounts?.postMessage('changed');
      openHash(returnTo || '#inicio');
      returnTo = undefined;
    } else if (view === 'cadastro') {
      await authRequest('register', { email, username, password });
      openHash('#login');
      showNotice('Se o cadastro foi aceito, a confirmação será enviada ao e-mail informado.');
    } else if (view === 'recuperar' || view === 'reenviar') {
      await authRequest(
        view === 'recuperar' ? 'password-reset/request' : 'email-verification/request',
        { email }
      );
      form.reset();
      showNotice('Se a conta estiver elegível, enviaremos o link por e-mail.');
    } else if (view === 'verificar') {
      await authRequest('email-verification/confirm', { token });
      await syncSession(false, false);
      accounts?.postMessage('changed');
      openHash(user ? '#inicio' : '#login');
      showNotice('E-mail confirmado.');
    } else if (view === 'redefinir') {
      await withSessionLock(() => authRequest('password-reset/confirm', { token, password }));
      ++accountSync;
      setUser(null);
      setGuestMode(false);
      accounts?.postMessage('changed');
      openHash('#login');
      showNotice('Senha atualizada. Entre com a nova senha.');
    }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    accountBusy = false;
    submit.disabled = false;
    form.removeAttribute('aria-busy');
  }
}

accountMenu.addEventListener('click', async ({ target }) => {
  if (!target.closest('[data-logout]') || accountBusy) return;
  accountBusy = true;
  target.disabled = true;
  try {
    await withSessionLock(() => authRequest('logout', {}));
    ++accountSync;
    setUser(null);
    setGuestMode(false);
    returnTo = undefined;
    accounts?.postMessage('changed');
    openHash('#login');
    showNotice('Você saiu da sua conta.');
  } catch (error) {
    showNotice(error.message);
  } finally {
    accountBusy = false;
    target.disabled = false;
  }
});

function update(field) {
  const name = field.name;
  if (field.dataset.feature) {
    draft.featureNotes ??= {};
    draft.featureNotes[field.dataset.feature] = field.value;
  } else if (field.dataset.group) {
    const group = projection.groups.find(({ key }) => key === field.dataset.group);
    if (!group) return;
    const selected = [...group.selected];
    selected[Number(field.dataset.index)] = field.value;
    draft.selected[group.key] = selected.filter(Boolean);
  } else if (name.startsWith('score-')) {
    const id = name.slice(6);
    const value = Number(field.value);
    if (draft.method === 'array') {
      const swapped = Object.keys(draft.scores).find((key) => draft.scores[key] === value);
      if (swapped) draft.scores[swapped] = draft.scores[id];
    }
    draft.scores[id] = value;
  } else if (name === 'level') {
    draft.level = Number(field.value);
  } else {
    if (name === 'method' && field.value === 'array') draft.scores = newCharacter(draft.id).scores;
    if (name === 'method' && field.value === 'points')
      draft.scores = Object.fromEntries(abilities.map(([id]) => [id, 8]));
    draft[name] = field.value;
  }
  persistChange();
}

function persistChange() {
  draft.updatedAt = Date.now();
  projection = projectCharacter(draft, catalog);
  draft.selected = projection.validSelections;
  if (missingChoices().length) draft.saved = false;
  if (!write()) showNotice('Armazenamento indisponível. As alterações ficam nesta aba.');
}

function pickerGroup() {
  return projection.groups.find(({ key }) => key === picker?.key);
}

function drawSpellPicker() {
  const group = pickerGroup();
  if (!group) {
    spellDialog.close();
    return;
  }
  const spells = group.options.map(({ id }) => catalog.bySpell.get(id)).filter(Boolean);
  const query = normalizeSearch(spellDialog.querySelector('#spell-search').value.trim());
  const level = spellDialog.querySelector('#spell-level').value;
  const matches = spells
    .filter(
      (spell) =>
        (!level || String(spell.level) === level) &&
        normalizeSearch(`${spellName(spell)} ${spell.name} ${spellSubtitle(spell)}`).includes(query)
    )
    .sort((a, b) => a.level - b.level || spellName(a).localeCompare(spellName(b), 'pt-BR'));
  const active = matches.find(({ id }) => id === picker.active) ?? matches[0];
  picker.active = active?.id;
  const list = spellDialog.querySelector('.picker-list');
  const scroll = list.scrollTop;
  list.innerHTML = matches.length
    ? matches
        .map(
          (spell) => `<button class="picker-row" type="button"
    data-preview-spell="${escape(spell.id)}" aria-pressed="${spell.id === active?.id}">
    <strong>${escape(spellName(spell))}</strong>
    <small>${escape(spellSubtitle(spell))}${group.selected.includes(spell.id) ? ' · Selecionada' : ''}</small></button>`
        )
        .join('')
    : '<p class="muted">Nenhuma magia corresponde à busca.</p>';
  list.scrollTop = scroll;
  spellDialog.querySelector('.picker-count').textContent =
    `${group.selected.length} de ${group.count} selecionadas`;
  const selected = active && group.selected.includes(active.id);
  spellDialog.querySelector('.picker-detail').innerHTML = active
    ? `
    <div class="picker-detail-header"><div><p class="eyebrow">${escape(spellSubtitle(active))}</p>
      <h3>${escape(spellName(active))}</h3></div>
      <button type="button" class="button ${selected ? 'secondary' : 'primary'}" data-toggle-spell="${escape(active.id)}"
        ${!selected && group.count > 1 && group.selected.length >= group.count ? 'disabled' : ''}>
        ${selected ? 'Remover magia' : group.count === 1 && group.selected.length ? 'Trocar magia' : 'Selecionar magia'}</button>
    </div>${spellDescription(active)}`
    : '<p class="muted">Altere a busca para ver os detalhes de uma magia.</p>';
}

function openSpellPicker(key) {
  picker = { key };
  const group = pickerGroup();
  if (!group) return;
  picker.active = group.selected[0];
  const levels = [
    ...new Set(
      group.options.map(({ id }) => catalog.bySpell.get(id)?.level).filter(Number.isInteger)
    ),
  ].sort((a, b) => a - b);
  spellDialog.innerHTML = `<header class="picker-header"><div>
    <p class="eyebrow">${escape(group.source)}</p><h2 id="spell-picker-title">Escolher magias</h2>
    <p class="muted">${escape(group.name)} · <span class="picker-count" aria-live="polite"></span></p></div>
    <button type="button" class="button secondary" data-close-picker>Concluir</button></header>
    <div class="picker-filters">
      <div><label for="spell-search">Buscar magia</label><input type="search" id="spell-search" autofocus></div>
      <div><label for="spell-level">Círculo</label><select id="spell-level"><option value="">Todos</option>
      ${levels.map((level) => `<option value="${level}">${spellCircle(level)}</option>`).join('')}</select></div>
    </div>
    <div class="picker-body"><div class="picker-list" aria-label="Magias disponíveis"></div>
      <section class="picker-detail" aria-label="Detalhes da magia"></section></div>`;
  drawSpellPicker();
  spellDialog.showModal();
}

spellDialog.addEventListener('input', ({ target }) => {
  if (target.id === 'spell-search' || target.id === 'spell-level') drawSpellPicker();
});

spellDialog.addEventListener('click', ({ target }) => {
  if (target.closest('[data-close-picker]')) {
    spellDialog.close();
    return;
  }
  const preview = target.closest('[data-preview-spell]');
  if (preview) {
    picker.active = preview.dataset.previewSpell;
    drawSpellPicker();
    spellDialog.querySelector('[data-preview-spell][aria-pressed="true"]')?.focus();
    return;
  }
  const action = target.closest('[data-toggle-spell]');
  const group = pickerGroup();
  if (!action || !group) return;
  const id = action.dataset.toggleSpell;
  if (!group.options.some((option) => option.id === id)) return;
  if (group.selected.includes(id))
    draft.selected[group.key] = group.selected.filter((value) => value !== id);
  else if (group.count === 1) draft.selected[group.key] = [id];
  else if (group.selected.length < group.count) draft.selected[group.key] = [...group.selected, id];
  else return;
  persistChange();
  main.innerHTML = builder();
  drawSpellPicker();
  (
    spellDialog.querySelector('[data-toggle-spell]:enabled') ??
    spellDialog.querySelector('[data-close-picker]')
  ).focus();
});

spellDialog.addEventListener('close', () => {
  const key = picker?.key;
  picker = undefined;
  document.getElementById(`picker:${key}`)?.focus();
});

main.addEventListener('click', ({ target }) => {
  const spellButton = target.closest('[data-picker]');
  if (spellButton) {
    openSpellPicker(spellButton.dataset.picker);
    return;
  }
  if (target.closest('[data-guest]')) {
    setGuestMode(true);
    openHash(returnTo || '#inicio');
    returnTo = undefined;
    return;
  }
  if (target.closest('[data-retry-catalog]')) {
    catalogRequest = loadCatalog();
    route();
    return;
  }
  if (target.closest('[data-more]')) {
    catalogLimit += 24;
    document.querySelector('#compendium-results').innerHTML = compendiumResults();
    return;
  }
  const button = target.closest('[data-remove-group]');
  if (!button) return;
  const key = button.dataset.removeGroup;
  draft.selected[key] = draft.selected[key].filter((id) => id !== button.dataset.option);
  persistChange();
  main.innerHTML = builder();
  document.getElementById(key)?.focus();
});

main.addEventListener('input', ({ target }) => {
  if (target.id === 'catalog-search') {
    catalogFilter = target.value;
    catalogLimit = 24;
    document.querySelector('#compendium-results').innerHTML = compendiumResults();
    return;
  }
  if (
    target.form?.id !== 'builder-form' ||
    !['name', 'notes', 'feature-note'].includes(target.name)
  )
    return;
  update(target);
  main.querySelector('h1').textContent = title(draft);
});

main.addEventListener('change', ({ target }) => {
  if (target.form?.id !== 'builder-form' || ['name', 'notes', 'feature-note'].includes(target.name))
    return;
  const open = [...main.querySelectorAll('details')].map((element) => element.open);
  update(target);
  main.innerHTML = builder();
  main.querySelectorAll('details').forEach((element, index) => {
    element.open = open[index] ?? false;
  });
  document.getElementById(target.id)?.focus({ preventScroll: true });
});

main.addEventListener('submit', (event) => {
  if (event.target.id === 'account-form') {
    event.preventDefault();
    void submitAccount(event.target);
    return;
  }
  if (event.target.id !== 'builder-form') return;
  event.preventDefault();
  if (step !== 'revisao' || missingChoices().length) return;
  draft.saved = true;
  draft.updatedAt = Date.now();
  if (write()) showNotice('Ficha salva neste navegador.');
  else showNotice('A ficha está disponível apenas nesta aba.');
  location.hash = link('ficha');
});

window.addEventListener('hashchange', () => {
  route();
  main.focus();
});
window.addEventListener('storage', (event) => {
  if (
    catalog &&
    !draft &&
    (user || guest) &&
    event.key?.startsWith(storagePrefix()) &&
    ['', '#inicio', '#personagens'].includes(location.hash)
  )
    route();
});

await syncSession(true);
accounts?.addEventListener('message', () => {
  if (!accountBusy) void syncSession();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && user && !accountBusy) void syncSession();
});
