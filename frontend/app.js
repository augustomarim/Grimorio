import {
  abilities,
  canAdjustScore,
  classPlan,
  displayName,
  indexCatalog,
  newCharacter,
  plannedClasses,
  pointBudget,
  pointCosts,
  pointsSpent,
  projectCharacter,
  rollAbilityScore,
  skillName,
  standardScores,
  unmetMulticlassRequirements,
} from './rules.js';
import { accountView, authRequest, restoreSession, withSessionLock } from './auth.js';
import { classArticles, classProgression, compendiumHref, sortEntries } from './compendium.js';
import { installGlossary } from './glossary.js';
import {
  damageTypeLabel,
  escapeHtml as escape,
  filterSpells,
  formatDescription,
  normalizeSearch,
  originalDescription,
  spellCard,
  spellCircle,
  spellDamageTypes,
  spellDescription,
  spellName,
  spellSchools,
  spellSubtitle,
} from './spells.js';

const main = document.querySelector('#main');
const choiceDialog = document.querySelector('#choice-picker');
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
let catalogSpellFilters = {};
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

const classLevels = (classes) =>
  classes.map(({ entry, levels }) => `${displayName(entry)} nível ${levels.length}`).join(' · ');

function characterList(characters) {
  return `<section class="panel"><header class="section-heading"><h2>Minhas fichas</h2><span>Salvas neste navegador</span></header>
    ${
      characters.length
        ? `<ul class="character-list">${characters
            .map(
              (character) => `<li>
      <a href="${characterLink(character)}">
        <span><strong>${escape(title(character))}</strong><small>
          ${escape(classLevels(plannedClasses(character, catalog)) || 'Classe a escolher')} · Nível total ${classPlan(character).length}
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
        <p class="muted">${escape([entry.species && displayName(entry.species), classLevels(entry.classes)].filter(Boolean).join(' · '))}
          · Nível total ${classPlan(featured).length}</p>
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
  ['subclasses', 'Subclasses'],
  ['species', 'Espécies'],
  ['backgrounds', 'Antecedentes'],
  ['magias', 'Magias'],
  ['feats', 'Talentos'],
];

function spellFilterControls(prefix, spells, filters = {}, includeDamage = false) {
  const levels = [...new Set(spells.map(({ level }) => level))].sort((a, b) => a - b);
  const schools = Object.entries(spellSchools)
    .filter(([id]) => spells.some(({ school }) => school === id))
    .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'));
  const publications = [
    ...new Set(spells.map(({ publication }) => publication).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const damage = includeDamage
    ? [...new Set(spells.flatMap(spellDamageTypes))]
        .map((type) => [type, damageTypeLabel(type)])
        .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))
    : [];
  return [
    ['level', 'Círculo', 'Todos', levels.map((level) => [String(level), spellCircle(level)])],
    ['school', 'Escola', 'Todas', schools],
    ['publication', 'Fonte', 'Todas', publications.map((book) => [book, book])],
    ...(includeDamage ? [['damage', 'Tipo de dano', 'Todos', damage]] : []),
  ]
    .map(
      ([key, label, all, options]) => `<div><label for="${prefix}-${key}">${label}</label>
      <select id="${prefix}-${key}" data-spell-filter="${key}"><option value="">${all}</option>
      ${options
        .map(
          ([id, name]) =>
            `<option value="${escape(id)}" ${filters[key] === id ? 'selected' : ''}>${escape(name)}</option>`
        )
        .join('')}</select></div>`
    )
    .join('');
}

function compendiumResults() {
  const query = normalizeSearch(catalogFilter.trim());
  const entries =
    catalogCategory === 'magias'
      ? filterSpells(catalog.spells, { ...catalogSpellFilters, search: catalogFilter })
      : catalog[catalogCategory].filter((entry) =>
          normalizeSearch(displayName(entry) + ' ' + entry.name).includes(query)
        );
  return `<p class="muted">${entries.length} resultados</p>
    ${sortEntries(entries)
      .slice(0, catalogLimit)
      .map((entry) => articleLink(catalogCategory, entry))
      .join('')}
    ${entries.length > catalogLimit ? '<button type="button" class="button secondary" data-more>Mostrar mais</button>' : ''}`;
}

function articleLink(category, entry) {
  const spell = category === 'magias';
  const tags = spell
    ? [spellSubtitle(entry), ...spellDamageTypes(entry).map(damageTypeLabel), entry.publication]
    : [
        category === 'subclasses' && classLabel(entry.class),
        featCategories[entry.category],
        entry.source,
      ];
  return `<a class="entry wiki-link" href="${compendiumHref(category, entry.id)}">
    <strong>${escape(displayName(entry))}</strong>
    <span>${tags
      .filter(Boolean)
      .map((tag) => `<span class="tag">${escape(tag)}</span>`)
      .join(' ')}</span>
  </a>`;
}

function compendium(articleId) {
  return `<section class="panel compendium"><h1>Compêndio</h1>
    <nav class="hub-nav" aria-label="Categorias">${compendiumTabs
      .map(
        ([id, label]) =>
          `<a href="#compendio/${id}" ${id === catalogCategory ? 'aria-current="page"' : ''}>${label}</a>`
      )
      .join('')}</nav>
    ${
      articleId
        ? compendiumArticle(articleId)
        : `<div class="compendium-filters"><div><label for="catalog-search">Buscar no compêndio</label>
      <input id="catalog-search" type="search" value="${escape(catalogFilter)}"></div>
      ${catalogCategory === 'magias' ? spellFilterControls('catalog', catalog.spells, catalogSpellFilters, true) : ''}
    </div>
    <div class="compendium-results" id="compendium-results">${compendiumResults()}</div>`
    }</section>`;
}

const classEntry = (name) =>
  catalog.classes.find((entry) => entry.name === name || entry.id === name);
const classLabel = (name) => displayName(classEntry(name) ?? { name });

function compendiumArticle(id) {
  const isSpell = catalogCategory === 'magias';
  const entry = (isSpell ? catalog.spells : catalog[catalogCategory]).find(
    (entry) => encodeURIComponent(entry.id) === id
  );
  const back = `<a href="#compendio/${catalogCategory}">Voltar para ${compendiumTabs.find(([id]) => id === catalogCategory)[1].toLowerCase()}</a>`;
  if (!entry) return `<p>${back}</p><p>Verbete não encontrado no catálogo.</p>`;
  const related = catalogCategory === 'classes' ? classArticles(entry, catalog) : undefined;
  const parent = entry.class && classEntry(entry.class);
  const classLinks = (entry.classes ?? []).map(classEntry).filter(Boolean);
  const lore = entry.lore ?? [];
  const progression = classProgression(entry);
  document.title = displayName(entry) + ' · Compêndio · Grimório';
  return `<article class="wiki-article">
    <p class="wiki-breadcrumb">${back}${parent ? ` <span aria-hidden="true">›</span> <a href="${compendiumHref('classes', parent.id)}">${escape(displayName(parent))}</a>` : ''}</p>
    <header><h2>${escape(displayName(entry))}</h2>
      <p class="muted">${[isSpell ? spellSubtitle(entry) : featCategories[entry.category], entry.source].filter(Boolean).map(escape).join(' · ')}</p>
    </header>
    ${isSpell ? spellDescription(entry, { glossary: true }) : optionDetails(entry, true)}
    ${classLinks.length ? `<section><h3>Listas de classe</h3><ul class="wiki-inline-links">${classLinks.map((cls) => `<li><a href="${compendiumHref('classes', cls.id)}">${escape(displayName(cls))}</a></li>`).join('')}</ul></section>` : ''}
    ${
      lore.length
        ? `<section><h3>Linhagens e história</h3>${lore
            .map(({ heading, body }, i) => {
              const translation = entry.translation?.lore?.[i];
              return details({ name: heading, body, translation }, true);
            })
            .join('')}</section>`
        : ''
    }
    ${
      progression.length
        ? `<details class="entry"><summary><strong>Progressão por nível</strong></summary>${progression
            .map(
              ({ columns, rows }, index) => `
      <div class="wiki-table" role="region" aria-label="Progressão de ${escape(displayName(entry))}, tabela ${index + 1}" tabindex="0">
      <table><thead><tr>${columns.map((name) => `<th scope="col">${escape(name)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([level, ...cells]) => `<tr><th scope="row">${escape(level)}</th>${cells.map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
            )
            .join('')}</details>`
        : ''
    }
    ${related?.subclasses.length ? `<section><h3>Subclasses</h3>${related.subclasses.map((entry) => articleLink('subclasses', entry)).join('')}</section>` : ''}
    ${
      related?.spells.length
        ? `<section><h3>Magias da classe</h3><p class="muted">${related.spells.length} magias no catálogo</p>
      ${[...new Set(related.spells.map(({ level }) => level))]
        .sort((a, b) => a - b)
        .map(
          (level) => `
        <details class="entry"><summary>${spellCircle(level)}</summary>
        <ul class="wiki-spell-list">${related.spells
          .filter((spell) => spell.level === level)
          .map((spell) => `<li>${articleLink('magias', spell)}</li>`)
          .join('')}</ul></details>`
        )
        .join('')}</section>`
        : ''
    }
  </article>`;
}

function select(field, label, values, selected) {
  return `<label for="${escape(field)}">${escape(label)}</label>
    <select name="${escape(field)}" id="${escape(field)}">
      <option value="">Selecione…</option>${values
        .map(
          (option) =>
            `<option value="${escape(option.id)}" ${selected === option.id ? 'selected' : ''}>${escape(displayName(option))}${
              option.source ? ' · ' + escape(option.source) : ''
            }</option>`
        )
        .join('')}</select>`;
}

function entryDescription(entry, full = false, glossary = false) {
  const fields = full ? ['body', 'text', 'summary'] : ['body', 'summary', 'text'];
  const field = fields.find((key) => entry[key] || entry.translation?.[key]);
  if (!field) return '';
  const original = entry[field];
  const translation = entry.translation?.[field];
  return `<p class="description" lang="${translation ? 'pt-BR' : 'en'}">${formatDescription(translation ?? original, glossary)}</p>
    ${
      original && translation && translation !== original
        ? originalDescription(entry.name, original, glossary)
        : ''
    }`;
}

function details(entry, glossary = false) {
  const statBlocks = entry.translation?.statBlocks;
  return `<details class="entry"><summary><strong>${escape(displayName(entry))}</strong>
    ${entry.level ? `<span class="tag">Nível ${entry.level}</span>` : ''}
    ${(entry.translation?.tags ?? []).map((tag) => `<span class="tag">${escape(tag)}</span>`).join('')}</summary>
    ${entry.source ? `<p class="muted">${escape(entry.source)}</p>` : ''}
    ${entryDescription(entry, false, glossary)}
    ${entry.options?.length ? `<div class="feature-references">${entry.options.map((option) => details(option, glossary)).join('')}</div>` : ''}
    ${
      statBlocks?.length
        ? `<section class="feature-references" aria-label="Blocos de estatísticas">
      ${statBlocks.map((block) => details({ ...block, translation: { body: block.body } }, glossary)).join('')}
    </section>`
        : ''
    }
    ${entry.prereq?.text ? `<p class="muted">Pré-requisito: ${escape(entry.prereq.text)}</p>` : ''}
    ${glossary ? wikiBenefits(entry) : ''}
    ${
      entry.key
        ? `<div class="feature-note"><label for="${escape(entry.key)}">Registrar escolha ou anotação</label>
      <input id="${escape(entry.key)}" name="feature-note" data-feature="${escape(entry.key)}" maxlength="500"
        value="${escape(draft.featureNotes?.[entry.key])}" placeholder="Ex.: uma opção descrita nesta habilidade"></div>`
        : ''
    }
  </details>`;
}

const pickerFields = {
  species: ['Espécie', 'species'],
  background: ['Antecedente', 'backgrounds'],
};

function pickerControl(group) {
  if (!group.options.length && group.key.endsWith('/spell/class-prepared'))
    return '<p class="muted">Para preparar magias, escolha primeiro as magias do grimório.</p>';
  if (!group.options.length && group.key.includes('/expertise/'))
    return '<p class="muted">Escolha primeiro as perícias em que terá proficiência.</p>';
  if (!group.options.length)
    return '<p class="muted">Nenhuma opção elegível com as escolhas atuais.</p>';
  const selected = group.options.filter(({ id }) => group.selected.includes(id));
  const action = selected.length ? 'Revisar' : 'Escolher';
  return `<div class="picker-control">
    <button type="button" class="button secondary" id="picker:${escape(group.key)}" data-picker="${escape(group.key)}"
      aria-haspopup="dialog">${action} ${group.spellPicker ? 'magias' : escape(group.name)}
      ${group.spellPicker ? `<span class="sr-only"> · ${escape(group.name)}</span>` : ''}</button>
    ${
      selected.length
        ? `<ul class="chips" aria-label="${escape(group.name)}">
      ${selected.map((entry) => `<li>${escape(displayName(entry))}</li>`).join('')}</ul>`
        : ''
    }
  </div>`;
}

function choiceBlock(group) {
  return `<fieldset class="choice ${group.depth ? 'nested' : ''}">
    <legend>${escape(group.source)}${group.section === 'progressao' ? ` · Nível de classe ${group.level}` : ''}</legend>
    <p class="choice-count">${group.selected.length}/${group.count} escolhidas</p>
    ${group.prompt ? `<p class="muted">${escape(group.prompt)}</p>` : ''}
    ${pickerControl(group)}
  </fieldset>`;
}

function benefits(section) {
  const features = projection.features.filter((entry) => !section || entry.section === section);
  return features.length
    ? `<section class="benefits"><h3>Características e habilidades</h3>
    ${features.map((entry) => details(entry)).join('')}</section>`
    : '';
}

function facts() {
  const entries = [
    ...projection.facts,
    { name: 'Perícias proficientes', value: [...projection.skills].map(skillName).join(', ') },
    { name: 'Especializações', value: [...projection.expertise].map(skillName).join(', ') },
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
      ${pickerControl(pickerGroup('species'))}
      ${pickerControl(pickerGroup('background'))}
    </div>
    ${
      projection.background
        ? `<section class="benefits" aria-label="Antecedente selecionado">
      <h3>${escape(displayName(projection.background))}</h3>
      ${optionDetails(projection.background)}
    </section>`
        : ''
    }
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

function attributeIssue() {
  const scores = abilities.map(([id]) => draft.scores[id]);
  if (draft.method === 'array') {
    if (new Set(scores).size !== scores.length)
      return 'Há valores repetidos. Use cada valor do conjunto padrão uma única vez.';
    if (!scores.every((value) => Object.values(standardScores).includes(value)))
      return 'Use os seis valores do conjunto padrão.';
  } else if (draft.method === 'points') {
    if (!scores.every((value) => Object.hasOwn(pointCosts, value)))
      return 'Na compra por pontos, os valores base vão de 8 a 15.';
    if (pointsSpent(draft.scores) > pointBudget)
      return 'Você passou do limite de 27 pontos. Diminua um ou mais atributos.';
  } else if (scores.some((value) => !Number.isInteger(value) || value < 3 || value > 18)) {
    return 'Informe um número inteiro de 3 a 18 para cada atributo.';
  }
}

function scoreControl(id, label) {
  const score = draft.scores[id];
  if (draft.method === 'array') {
    const values = Object.values(standardScores);
    return `<div class="score-options" role="group" aria-labelledby="score-label-${id}">
      ${values
        .map(
          (value) => `<label><input type="radio" name="score-${id}" id="score-${id}-${value}"
        value="${value}" ${score === value ? 'checked' : ''}><span>${value}</span></label>`
        )
        .join('')}
    </div>`;
  }
  if (draft.method === 'points') {
    const adjustment = (delta, symbol, action) =>
      `<button type="button" class="button secondary" id="score-${id}-${delta}"
        data-adjust-score="${id}" data-delta="${delta}" aria-label="${action} ${label}"
        ${canAdjustScore(draft.scores, id, delta) ? '' : 'disabled'}>${symbol}</button>`;
    return `<div class="score-stepper">
      ${adjustment(-1, '−', 'Diminuir')}
      <output aria-label="Valor base de ${label}">${score}</output>
      ${adjustment(1, '+', 'Aumentar')}
    </div>`;
  }
  const batch = draft.abilityBatch;
  if (batch) {
    const taken = Object.entries(batch.assignments)
      .filter(([ability]) => ability !== id)
      .map(([, index]) => index);
    return `<select name="roll-${id}" id="roll-${id}" aria-label="Resultado para ${label}">
      <option value="">Escolha um resultado</option>
      ${batch.rolls
        .map(
          ({ score }, index) => `<option value="${index}"
        ${batch.assignments[id] === index ? 'selected' : ''} ${taken.includes(index) ? 'disabled' : ''}>
        #${index + 1} · ${escape(score)}</option>`
        )
        .join('')}
    </select>`;
  }
  return `<div class="score-manual">
    <input name="score-${id}" id="score-${id}" aria-label="Valor base de ${label}" type="number"
      min="3" max="18" value="${escape(score)}">
    <button type="button" class="button secondary" id="roll-score-${id}" data-roll-score="${id}"
      aria-label="Rolar ${label}">Rolar</button>
  </div>`;
}

function rollSummary({ dice, discarded, score }) {
  return `${dice.join(', ')} · descartado ${discarded} · total ${score}`;
}

function rollControls() {
  const batch = draft.abilityBatch;
  return `<p class="muted">Cada rolagem usa 4d6 e descarta o menor dado.
    ${batch ? 'Escolha um resultado para cada atributo e aplique a distribuição.' : 'Role um atributo por vez ou gere seis resultados para distribuir.'}</p>
    <div class="score-actions">
      <button type="button" class="button secondary" id="roll-batch" data-score-action>
        ${batch ? 'Gerar outros 6 resultados' : 'Rolar 6 para distribuir'}</button>
      ${
        batch
          ? `<button type="button" class="button secondary" id="cancel-batch" data-score-action>Voltar à rolagem individual</button>
      <button type="button" class="button primary" id="apply-batch" data-score-action
        ${Object.keys(batch.assignments).length === abilities.length ? '' : 'disabled'}>Aplicar distribuição</button>`
          : ''
      }
    </div>
    ${
      batch
        ? `<ol class="score-pool" aria-label="Resultados das rolagens">${batch.rolls
            .map(
              (roll, index) => `<li><strong>#${index + 1} · ${escape(roll.score)}</strong>
            <small>${escape(rollSummary(roll))}</small></li>`
            )
            .join('')}</ol>`
        : ''
    }<p id="roll-results" class="muted" role="status"></p>`;
}

function attributes() {
  const points = pointsSpent(draft.scores);
  const issue = attributeIssue();
  const scores = Object.values(draft.scores);
  const methods = [
    ['array', 'Conjunto padrão'],
    ['points', 'Compra por pontos'],
    ['manual', 'Valores rolados'],
  ];
  return `<h2>Atributos</h2><p class="muted">Distribua os valores base. Os aumentos escolhidos são somados na coluna de valor final.</p>
    <fieldset class="choice score-method"><legend>Método</legend><div class="score-options">
      ${methods
        .map(
          ([id, label]) => `<label><input type="radio" name="method" id="method-${id}" value="${id}"
        ${draft.method === id ? 'checked' : ''}><span>${label}</span></label>`
        )
        .join('')}
    </div></fieldset>
    ${draft.method === 'array' ? '<p class="muted">Escolha um valor em cada atributo. Use 15, 14, 13, 12, 10 e 8 uma vez cada.</p>' : ''}
    ${draft.method === 'points' ? `<p class="muted">Pontos usados <strong>${points}/${pointBudget}</strong> · Restantes <strong>${pointBudget - points}</strong></p>` : ''}
    ${issue ? `<p class="score-error" role="alert">${issue}</p>` : ''}
    ${issue && draft.method === 'array' ? '<button type="button" class="button secondary" id="reset-array" data-score-action>Restaurar conjunto padrão</button>' : ''}
    ${draft.method === 'manual' ? rollControls() : ''}
    <div class="scores attribute-scores">${abilities
      .map(([id, , label]) => {
        const repeated =
          draft.method === 'array' &&
          scores.filter((value) => value === draft.scores[id]).length > 1;
        return `<div class="${repeated ? 'score-repeated' : ''}">
      <span class="score-label" id="score-label-${id}">${label}</span>
      ${scoreControl(id, label)}
      <small>Final <strong>${projection.scores[id]}</strong> · ${plus(modifier(projection.scores[id]))}</small></div>`;
      })
      .join('')}</div>`;
}

function progression() {
  const groups = projection.groups.filter(({ section }) => section === 'progressao');
  const plan = classPlan(draft);
  const requirements = unmetMulticlassRequirements(projection.classes, projection.scores);
  return `<h2>Classe e níveis</h2><p class="muted">A cada nível, avance em uma classe que já tem ou escolha uma nova.</p>
    <p><strong>Nível total ${plan.length}</strong>${projection.classes.length ? ` · ${escape(classLevels(projection.classes))}` : ''}</p>
    ${requirements.length ? `<p class="score-error" role="alert">${escape(requirements.join('. '))}.</p>` : ''}
    ${plan
      .map((id, index) => {
        const level = index + 1;
        const track = projection.classes.find(({ entry }) => entry.id === id);
        const label =
          track && `${displayName(track.entry)} nível ${track.levels.indexOf(level) + 1}`;
        return `<section class="level"><h3>Nível total ${level}${label ? ` · ${escape(label)}` : ''}</h3>
      <button type="button" class="button secondary" id="picker:class-level/${index}" data-picker="class-level/${index}"
        aria-haspopup="dialog">${id ? 'Trocar' : 'Escolher'} classe do nível ${level}</button>
      ${groups
        .filter((group) => group.characterLevel === level)
        .map(choiceBlock)
        .join('')}</section>`;
      })
      .join('')}
    <div class="score-actions">
      ${
        plan.length < 20 && plan.every(Boolean)
          ? `<button type="button" class="button primary"
        data-picker="class-level/${plan.length}" aria-haspopup="dialog">Adicionar nível ${plan.length + 1}</button>`
          : ''
      }
      ${plan.length > 1 ? '<button type="button" class="button secondary" data-remove-level>Remover último nível</button>' : ''}
    </div>
    ${benefits('progressao')}`;
}

function missingChoices() {
  const pending = [];
  if (!draft.name.trim()) pending.push(['origem', 'Nome']);
  if (!projection.species) pending.push(['origem', 'Espécie']);
  if (!projection.background) pending.push(['origem', 'Antecedente']);
  classPlan(draft).forEach((id, index) => {
    if (!id) pending.push(['progressao', `Classe do nível ${index + 1}`]);
  });
  for (const requirement of unmetMulticlassRequirements(projection.classes, projection.scores))
    pending.push(['progressao', requirement]);
  if (attributeIssue()) pending.push(['atributos', 'Distribuição dos atributos']);
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
    <p class="muted">${escape(classLevels(projection.classes))}</p>
    <dl class="scores sheet-scores">${scores}</dl>
    ${facts()}
    ${benefits()}
    ${projection.feats.length ? `<section class="benefits"><h3>Talentos</h3>${projection.feats.map((entry) => details(entry)).join('')}</section>` : ''}
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
    ['Espécie', projection.species && displayName(projection.species)],
    ['Antecedente', projection.background && displayName(projection.background)],
    ['Classes', classLevels(projection.classes)],
    [
      'Subclasses',
      projection.classes
        .flatMap(({ subclass }) => (subclass ? [displayName(subclass)] : []))
        .join(' · '),
    ],
  ];
  return `<a class="back" href="#inicio">← Meus personagens</a>
    <header class="builder-header"><p class="eyebrow">Construtor de personagem</p><h1>${escape(title(draft))}</h1>
      <p class="muted">Nível total ${classPlan(draft).length} · ${draft.saved ? 'Ficha salva' : 'Rascunho'}</p></header>
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
        <dl class="facts">${summary.map(([name, value]) => `<div><dt>${name}</dt><dd>${value ? escape(value) : '—'}</dd></div>`).join('')}</dl>
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
  if (choiceDialog.open) choiceDialog.close();
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
      catalogSpellFilters = {};
      catalogLimit = 24;
    }
    catalogCategory = category;
    main.innerHTML = hubShell(page, compendium(section));
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
  } else if (name.startsWith('score-')) {
    draft.scores[name.slice(6)] = Number(field.value);
  } else if (name.startsWith('roll-')) {
    const { rolls, assignments } = draft.abilityBatch;
    const id = name.slice(5);
    const index = Number(field.value);
    if (field.value === '') delete assignments[id];
    else if (rolls[index] && !Object.values(assignments).includes(index)) assignments[id] = index;
  } else {
    if (name === 'method') delete draft.abilityBatch;
    if (name === 'method' && field.value === 'array') draft.scores = { ...standardScores };
    if (name === 'method' && field.value === 'points')
      draft.scores = Object.fromEntries(abilities.map(([id]) => [id, 8]));
    draft[name] = field.value;
  }
  persistChange();
}

function persistChange() {
  draft.updatedAt = Date.now();
  projection = projectCharacter(draft, catalog);
  if (step !== 'atributos' || !attributeIssue()) draft.selected = projection.validSelections;
  if (missingChoices().length) draft.saved = false;
  if (!write()) showNotice('Armazenamento indisponível. As alterações ficam nesta aba.');
}

function changeScores(button) {
  const { adjustScore, rollScore } = button.dataset;
  let focusId = button.id;
  let result;
  if (adjustScore) {
    const delta = Number(button.dataset.delta);
    if (!canAdjustScore(draft.scores, adjustScore, delta)) return;
    draft.scores[adjustScore] += delta;
    if (!canAdjustScore(draft.scores, adjustScore, delta))
      focusId = `score-${adjustScore}-${-delta}`;
  } else if (button.id === 'reset-array') {
    draft.scores = { ...standardScores };
    focusId = 'score-str-15';
  } else if (rollScore) {
    const roll = rollAbilityScore();
    const [, , label] = abilities.find(([id]) => id === rollScore);
    draft.scores[rollScore] = roll.score;
    result = `${label}: ${rollSummary(roll)}`;
  } else if (button.id === 'roll-batch') {
    draft.abilityBatch = { rolls: abilities.map(() => rollAbilityScore()), assignments: {} };
  } else if (button.id === 'apply-batch') {
    const { rolls, assignments } = draft.abilityBatch;
    if (!abilities.every(([id]) => rolls[assignments[id]])) return;
    for (const [id] of abilities) draft.scores[id] = rolls[assignments[id]].score;
    delete draft.abilityBatch;
    focusId = 'roll-batch';
    result = 'Distribuição aplicada.';
  } else if (button.id === 'cancel-batch') {
    delete draft.abilityBatch;
    focusId = 'roll-batch';
  }
  persistChange();
  main.innerHTML = builder();
  document.getElementById(focusId)?.focus({ preventScroll: true });
  if (result) document.getElementById('roll-results').textContent = result;
}

function pickerGroup(key = picker?.key) {
  const slot = /^class-level\/(\d+)$/.exec(key);
  if (slot) {
    const plan = classPlan(draft);
    const index = Number(slot[1]);
    if (index > plan.length || index >= 20) return;
    const preceding = plan.slice(0, index);
    const options = catalog.classes
      .map((entry) => {
        const count = preceding.filter((id) => id === entry.id).length;
        return { ...entry, nextClassLevel: count + 1, continuingClass: count > 0 };
      })
      .sort((a, b) => Number(b.continuingClass) - Number(a.continuingClass));
    return {
      key,
      index,
      name: `Classe do nível ${index + 1}`,
      count: 1,
      options,
      selected: plan[index] ? [plan[index]] : [],
    };
  }
  if (Object.hasOwn(pickerFields, key)) {
    const [name, collection] = pickerFields[key];
    return {
      key,
      name,
      field: key,
      count: 1,
      options: catalog[collection],
      selected: draft[key] ? [draft[key]] : [],
    };
  }
  return projection.groups.find((group) => group.key === key);
}

const featCategories = {
  Origin: 'Talento de origem',
  General: 'Talento geral',
  'Fighting Style': 'Estilo de combate',
  'Epic Boon': 'Dádiva épica',
  'Dark Gift': 'Dom sombrio',
  Dragonmark: 'Marca Dracônica',
  'Planar Pact': 'Pacto planar',
};
const abilityLabel = (name) =>
  abilities.find(([id, english]) => id === name || english === name)?.[2] ?? name;
const optionLabels = (option) =>
  [
    option.source ?? option.feat?.source,
    featCategories[option.category],
    option.collection === 'fighting-styles' && 'Estilo de combate',
    option.id.startsWith('skill:') && 'Perícia',
    option.hitDie && `Dado de vida ${option.hitDie.toLowerCase()}`,
    option.ability && abilityLabel(option.ability),
    option.mastery && `Maestria: ${option.mastery}`,
    option.nextClassLevel &&
      (option.continuingClass ? `Continuar · nível ${option.nextClassLevel}` : 'Começar · nível 1'),
    ...(option.translation?.tags ?? []),
  ].filter(Boolean);

function wikiBenefits(entry) {
  const {
    spellsFixed,
    spellChoices,
    featsFixed,
    skillChoices,
    skillsFixed,
    expertiseFixed,
    expertise,
    toolsFixed,
    toolChoices,
    languagesFixed,
    languageChoices,
    abilityBoosts,
    armorTraining,
    weaponTraining,
  } = { ...entry, ...entry.effects };
  const armor = { Light: 'Leve', Medium: 'Média', Heavy: 'Pesada', Shield: 'Escudos' };
  const weapons = { Simple: 'Simples', Martial: 'Marciais' };
  const fixed = [
    ['Proficiências em perícias', skillsFixed?.map(skillName)],
    ['Especialização', expertiseFixed?.map(skillName)],
    ['Ferramentas', toolsFixed?.map((id) => displayName(catalog.byTool.get(id) ?? { name: id }))],
    [
      'Idiomas',
      languagesFixed?.map((id) => displayName(catalog.byLanguage.get(id) ?? { name: id })),
    ],
    ['Armaduras', armorTraining?.map(({ kind }) => armor[kind] ?? kind)],
    [
      'Armas',
      weaponTraining?.map(
        ({ category, id }) => weapons[category] ?? catalog.byItem.get(id)?.name ?? category ?? id
      ),
    ],
  ].filter(([, values]) => values?.length);
  const picks = [
    ...(skillChoices ?? []).map(
      ({ pick, from, level }) =>
        `Perícias (escolha ${pick})${level > 1 ? ` no nível ${level}` : ''}${from?.length ? ` · ${from.map(skillName).join(', ')}` : ''}`
    ),
    ...(Array.isArray(expertise) ? expertise : []).map(
      ({ pick, level }) =>
        `Especialização (escolha ${pick})${level > 1 ? ` no nível ${level}` : ''}`
    ),
    ...(toolChoices ?? []).map(
      ({ pick, skills }) =>
        `Escolha ${pick} entre ${skills ? 'perícias e ferramentas' : 'ferramentas'}`
    ),
    ...(languageChoices ?? []).map(({ pick }) => `Idiomas (escolha ${pick})`),
    ...(abilityBoosts ?? []).map(
      ({ points, from, max }) =>
        `Aumento de atributo · +${points} ${from?.length ? `entre ${from.map(abilityLabel).join(', ')}` : 'à escolha'} (máximo ${max})`
    ),
    ...(spellChoices ?? []).map(({ pick, spellLevel, list, lists, level }) => {
      const sources = (lists ?? (list ? [list] : [])).map(classLabel);
      return `Magias (escolha ${pick})${spellLevel === undefined ? '' : ` · ${spellCircle(spellLevel)}`}${sources.length ? ` · ${sources.join(' / ')}` : ''}${level > 1 ? ` · no nível ${level}` : ''}`;
    }),
  ];
  const links = [
    ...(spellsFixed ?? []).map(({ id, level }) => {
      const spell = catalog.bySpell.get(id);
      return (
        spell &&
        `<li><a href="${compendiumHref('magias', id)}">${escape(spellName(spell))}</a>${level > 1 ? ` · a partir do nível ${escape(level)}` : ''}</li>`
      );
    }),
    ...(featsFixed ?? []).map(({ id, note }) => {
      const feat = catalog.byFeat.get(id);
      return (
        feat &&
        `<li><a href="${compendiumHref('feats', id)}">${escape(displayName(feat))}</a>${note ? ` · ${escape(classLabel(note))}` : ''}</li>`
      );
    }),
  ].filter(Boolean);
  if (!fixed.length && !picks.length && !links.length) return '';
  return `<section class="wiki-benefits"><h3>Benefícios e escolhas</h3><ul>
    ${fixed.map(([label, values]) => `<li><strong>${label}</strong> · ${escape(values.join(', '))}</li>`).join('')}
    ${picks.map((value) => `<li>${escape(value)}</li>`).join('')}
    ${links.join('')}</ul></section>`;
}

function optionDetails(option, wiki = false) {
  const style = option.collection === 'fighting-styles' && catalog.byFeat.get(option.id);
  const grantedFeat = option.feat && typeof option.feat === 'object' ? option.feat : undefined;
  const entry = grantedFeat ?? (style || option);
  const description = entryDescription(entry, true, wiki);
  const features = [...(entry.traits ?? []), ...(entry.features ?? [])];
  const choices = (entry.choices ?? []).filter((choice) => choice.options?.length);
  const rows = [
    ['Atributo principal', entry.primaryAbility?.map(abilityLabel).join(' / ')],
    ['Dado de vida', wiki && entry.hitDie],
    [
      'Atributo de conjuração',
      wiki && entry.casting?.ability && abilityLabel(entry.casting.ability),
    ],
    ['Resistências proficientes', entry.savingThrows?.map(abilityLabel).join(', ')],
    ['Nível de subclasse', entry.subclassLevel],
    ['Deslocamento', entry.speed && `${entry.speed} pés`],
    ['Tipo de criatura', entry.creatureType],
    [
      'Tamanho',
      entry.size?.map((size) => ({ Medium: 'Médio', Small: 'Pequeno' })[size] ?? size).join(' / '),
    ],
    ['Atributos do antecedente', entry.abilityScores?.map(abilityLabel).join(', ')],
    ['Perícias', !wiki && entry.skillsFixed?.map(skillName).join(', ')],
    ['Ferramenta', entry.tool],
    [
      'Talento',
      !wiki &&
        (entry.featsFixed
          ?.map(({ id, note }) => {
            const feat = catalog.byFeat.get(id);
            const name = feat ? displayName(feat) : id;
            return note
              ? `${name} · ${displayName(catalog.byContent.get(note.toLowerCase()) ?? { name: note })}`
              : name;
          })
          .join(', ') ||
          entry.feat),
    ],
    ['Origem', entry.origin],
    ['Uso da ferramenta', entry.utilize],
    ['Dano', entry.damage],
    ['Propriedades', entry.properties],
    ['Pré-requisito', entry.prereq?.text],
    ['Talento repetível', wiki && entry.repeatable && 'Sim'],
    ...(entry.grants ?? []).map(({ label, value }) => [label, value]),
  ].filter(([, value]) => value);
  const spell = option.spell && catalog.bySpell.get(option.spell);
  const fixedSpells = (entry.spellsFixed ?? [])
    .map(({ id, level }) => {
      const fixed = catalog.bySpell.get(id);
      return fixed ? `${spellName(fixed)} (nível ${level ?? 1})` : '';
    })
    .filter(Boolean);
  return `${rows.length ? `<dl class="spell-facts">${rows.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}
    ${description}
    ${wiki ? wikiBenefits(entry) : fixedSpells.length ? `<p><strong>Magias concedidas.</strong> ${escape(fixedSpells.join(' · '))}</p>` : ''}
    ${features.length ? `<section class="benefits"><${wiki ? 'h3' : 'h4'}>Características e habilidades</${wiki ? 'h3' : 'h4'}>${features.map((feature) => details(feature, wiki)).join('')}</section>` : ''}
    ${choices
      .map(
        (
          choice
        ) => `<section class="benefits"><${wiki ? 'h3' : 'h4'}>${escape(displayName(choice))}</${wiki ? 'h3' : 'h4'}>
      ${wiki && (choice.translation?.prompt || choice.prompt) ? `<p class="muted">${escape(choice.translation?.prompt ?? choice.prompt)}</p>` : ''}
      <div class="feature-references">${choice.options.map((option) => details(option, wiki)).join('\n')}</div></section>`
      )
      .join('')}
    ${spell ? spellCard(spell) : ''}
    ${description || features.length || rows.length || spell || fixedSpells.length || choices.length ? '' : '<p class="muted">Sem descrição disponível no catálogo.</p>'}`;
}

function drawPicker() {
  const group = pickerGroup();
  if (!group) {
    choiceDialog.close();
    return;
  }
  const search = choiceDialog.querySelector('#picker-search').value;
  const query = normalizeSearch(search.trim());
  const name = group.spellPicker ? spellName : displayName;
  const tags = group.spellPicker
    ? (spell) => [spellSubtitle(spell), spell.publication].filter(Boolean)
    : optionLabels;
  const matches = group.spellPicker
    ? filterSpells(group.options.map(({ id }) => catalog.bySpell.get(id)).filter(Boolean), {
        search,
        level: choiceDialog.querySelector('#spell-level').value,
        school: choiceDialog.querySelector('#spell-school').value,
        publication: choiceDialog.querySelector('#spell-publication').value,
      }).sort((a, b) => a.level - b.level || name(a).localeCompare(name(b), 'pt-BR'))
    : group.options.filter((entry) =>
        normalizeSearch([name(entry), entry.name, ...tags(entry)].join(' ')).includes(query)
      );
  const active = matches.find(({ id }) => id === picker.active) ?? matches[0];
  picker.active = active?.id;
  const list = choiceDialog.querySelector('.picker-list');
  const scroll = list.scrollTop;
  list.innerHTML = matches.length
    ? matches
        .map((entry) => {
          const metadata = tags(entry);
          if (group.selected.includes(entry.id)) metadata.push('Selecionada');
          return `<button class="picker-row" type="button"
    data-preview-option="${escape(entry.id)}" aria-pressed="${entry.id === active?.id}">
    <strong>${escape(name(entry))}</strong>
    ${metadata.length ? `<small>${escape(metadata.join(' · '))}</small>` : ''}</button>`;
        })
        .join('')
    : '<p class="muted">Nenhuma opção corresponde à busca.</p>';
  list.scrollTop = scroll;
  choiceDialog.querySelector('.picker-count').textContent =
    `${group.selected.length} de ${group.count} selecionadas`;
  const selected = active && group.selected.includes(active.id);
  choiceDialog.querySelector('.picker-detail').innerHTML = active
    ? `
    <div class="picker-detail-header"><div><h3>${escape(name(active))}</h3>
      <div class="picker-tags">${tags(active)
        .map((tag) => `<span class="tag">${escape(tag)}</span>`)
        .join('')}</div></div>
      <button type="button" class="button ${selected ? 'secondary' : 'primary'}" data-toggle-option="${escape(active.id)}"
        ${(selected && group.index !== undefined) || (!selected && group.count > 1 && group.selected.length >= group.count) ? 'disabled' : ''}>
        ${selected ? (group.index === undefined ? 'Remover' : 'Selecionada') : group.count === 1 && group.selected.length ? 'Trocar' : 'Selecionar'}${group.spellPicker ? ' magia' : ''}</button>
    </div>${group.spellPicker ? spellDescription(active) : optionDetails(active)}`
    : '<p class="muted">Altere a busca para ver os detalhes de uma opção.</p>';
}

function openPicker(key) {
  picker = { key };
  const group = pickerGroup();
  if (!group) return;
  picker.active = group.selected[0];
  choiceDialog.innerHTML = `<header class="picker-header"><div>
    ${group.source ? `<p class="eyebrow">${escape(group.source)}</p>` : ''}<h2 id="choice-picker-title">${escape(group.name)}</h2>
    ${group.prompt ? `<p class="muted">${escape(group.prompt)}</p>` : ''}
    <p class="picker-count muted" aria-live="polite"></p></div>
    <button type="button" class="button secondary" data-close-picker>Concluir</button></header>
    <div class="picker-filters">
      <div><label for="picker-search">${group.spellPicker ? 'Buscar magia' : 'Buscar opção'}</label><input type="search" id="picker-search" autofocus></div>
      ${group.spellPicker ? spellFilterControls('spell', group.options.map(({ id }) => catalog.bySpell.get(id)).filter(Boolean)) : ''}
    </div>
    <div class="picker-body"><div class="picker-list" aria-label="Opções disponíveis"></div>
      <section class="picker-detail" aria-label="Detalhes da opção"></section></div>`;
  drawPicker();
  choiceDialog.showModal();
}

choiceDialog.addEventListener('input', ({ target }) => {
  if (target.id === 'picker-search' || target.dataset.spellFilter) drawPicker();
});

choiceDialog.addEventListener('click', ({ target }) => {
  if (target.closest('[data-close-picker]')) {
    choiceDialog.close();
    return;
  }
  const preview = target.closest('[data-preview-option]');
  if (preview) {
    picker.active = preview.dataset.previewOption;
    drawPicker();
    choiceDialog.querySelector('[data-preview-option][aria-pressed="true"]')?.focus();
    return;
  }
  const action = target.closest('[data-toggle-option]');
  const group = pickerGroup();
  if (!action || !group) return;
  const id = action.dataset.toggleOption;
  if (!group.options.some((option) => option.id === id)) return;
  if (group.index !== undefined) {
    draft.classPlan = [...classPlan(draft)];
    draft.classPlan[group.index] = id;
    persistChange();
    main.innerHTML = builder();
    choiceDialog.close();
    return;
  }
  let selected;
  if (group.selected.includes(id)) selected = group.selected.filter((value) => value !== id);
  else if (group.count === 1) selected = [id];
  else if (group.selected.length < group.count) selected = [...group.selected, id];
  else return;
  if (group.field) draft[group.field] = selected[0] ?? '';
  else draft.selected[group.key] = selected;
  persistChange();
  main.innerHTML = builder();
  drawPicker();
  (
    choiceDialog.querySelector('[data-toggle-option]:enabled') ??
    choiceDialog.querySelector('[data-close-picker]')
  ).focus();
});

choiceDialog.addEventListener('close', () => {
  const key = picker?.key;
  picker = undefined;
  document.getElementById(`picker:${key}`)?.focus();
});

main.addEventListener('click', ({ target }) => {
  if (target.closest('[data-remove-level]')) {
    draft.classPlan = classPlan(draft).slice(0, -1);
    persistChange();
    main.innerHTML = builder();
    document.getElementById(`picker:class-level/${draft.classPlan.length - 1}`)?.focus();
    return;
  }
  const scoreButton = target.closest('[data-score-action], [data-adjust-score], [data-roll-score]');
  if (scoreButton) {
    changeScores(scoreButton);
    return;
  }
  const pickerButton = target.closest('[data-picker]');
  if (pickerButton) {
    openPicker(pickerButton.dataset.picker);
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
});

main.addEventListener('input', ({ target }) => {
  if (target.dataset.spellFilter) {
    catalogSpellFilters[target.dataset.spellFilter] = target.value;
    catalogLimit = 24;
    document.querySelector('#compendium-results').innerHTML = compendiumResults();
    return;
  }
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
installGlossary();
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
