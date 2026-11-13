import {
  abilities,
  availableSpellChoices,
  canAdjustScore,
  classPlan,
  creatureTypeName,
  displayName,
  grantDetails,
  indexCatalog,
  newCharacter,
  plannedClasses,
  progressionRequirements,
  pointBudget,
  pointsSpent,
  prerequisiteText,
  projectCharacter,
  rollAbilityScore,
  skillName,
  standardScores,
  unmetMulticlassRequirements,
} from './rules.js';
import { attributeIssue, characterIssues } from './validation.js';
import {
  characterInventory, completeRest, deriveCharacter, equippedWeaponRolls, equipmentConflicts, equipmentSlot, playResources, rollDice, updatePlayHP,
} from './mechanics.js';
import { accountLink, accountView, authRequest, restoreSession, withSessionLock } from './auth.js';
import { characterRequest, syncCharacters } from './characters.js';
import { classArticles, classProgression, compendiumHref, sortEntries } from './compendium.js';
import { installGlossary } from './glossary.js';
import {
  damageTypeLabel,
  escapeHtml as escape,
  filterSpells,
  formatRulesDescription,
  gameIcon,
  normalizeSearch,
  originalDescription,
  rulesDescriptionParts,
  rulesTable,
  spellCard,
  spellCircle,
  spellDamageTypes,
  spellDescription,
  spellIcon,
  spellName,
  spellRolls,
  spellSchools,
  spellTagMarkup,
} from './spells.js';

const main = document.querySelector('#main');
const choiceDialog = document.querySelector('#choice-picker');
const notice = document.querySelector('#notice');
const accountMenu = document.querySelector('#account-menu');
const headerMenu = document.querySelector('#header-menu');
const profileName = document.querySelector('#profile-name');
const themeToggle = document.querySelector('#theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let chosenTheme = localStorage.getItem('grimorio.theme');

function applyTheme() {
  const dark = chosenTheme ? chosenTheme === 'dark' : systemTheme.matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-checked', String(dark));
}

function setTheme(theme) {
  chosenTheme = theme;
  if (theme) localStorage.setItem('grimorio.theme', theme);
  else localStorage.removeItem('grimorio.theme');
  applyTheme();
}

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  const themeSelect = main.querySelector('#account-theme');
  if (themeSelect) themeSelect.value = chosenTheme;
});
systemTheme.addEventListener('change', applyTheme);
applyTheme();
document.addEventListener('click', (event) => {
  if (!headerMenu.contains(event.target) || event.target.closest('#account-menu a, #account-menu button')) {
    headerMenu.open = false;
  }
});
headerMenu.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !headerMenu.open) return;
  headerMenu.open = false;
  headerMenu.querySelector('summary').focus();
});
const diceBoard = document.querySelector('#dice-board');
const dicePopup = document.querySelector('#dice-popup');
const diceResults = document.querySelector('#dice-results');
dicePopup.querySelector('button').addEventListener('click', () => dicePopup.close());
let diceTimer;
const guestKey = 'grimorio.guest';
const accounts =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel('grimorio-account') : null;
const steps = [
  ['origem', 'Origem'],
  ['atributos', 'Atributos'],
  ['progressao', 'Classe e níveis'],
  ['equipamento', 'Equipamento'],
  ['historia', 'História'],
  ['revisao', 'Revisão'],
];
const sheetTabs = [
  ['combate', 'Combate'],
  ['testes', 'Atributos e perícias'],
  ['magias', 'Magias'],
  ['inventario', 'Inventário'],
  ['habilidades', 'Habilidades'],
  ['historia', 'História e anotações'],
];
let sheetTab = 'combate';
let sessionId;
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
let catalogSource = '';
let catalogSpellFilters = {};
let catalogLimit = 24;
let characterSync;
let characterFilter = '';
let publicSheet = false;
let publicRecord;
let lastCast;
let gallery;
const memory = new Map();
const characterAccess = new Map();
let viewedCharacter;
let picker;
const slug = (value) => /^[a-f\d-]{36}$/i.test(value ?? '');
const title = (character) => character.name.trim() || 'Novo personagem';
const link = (section) => `#personagem/${draft.id}/${section}`;
const sheetLink = (id) => `#ficha/${id}`;
const plus = (n) => (n < 0 ? String(n) : `+${n}`);
const modifier = (n) => Math.floor((n - 10) / 2);
const storagePrefix = () =>
  user ? `grimorio.account.${user.id}.character.` : 'grimorio.character.';
const accessKey = (id) => `${storagePrefix()}opened.${id}`;

function lastOpened(id) {
  const key = accessKey(id);
  try {
    return Math.max(characterAccess.get(key) ?? 0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return characterAccess.get(key) ?? 0;
  }
}

function markOpened(id) {
  const key = accessKey(id);
  if (viewedCharacter === key) return;
  viewedCharacter = key;
  const opened = Date.now();
  characterAccess.set(key, opened);
  try {
    localStorage.setItem(key, String(opened));
  } catch {}
}
const characterLink = (character) =>
  character.saved ? sheetLink(character.id) : `#personagem/${character.id}/origem`;
const characterTarget = (character) => character.saved ? 'target="_blank" rel="noopener"' : '';

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

function cacheCharacter(character, id = character?.id) {
  if (!id) return;
  if (!character) {
    memory.delete(id);
    characterAccess.delete(accessKey(id));
    try {
      localStorage.removeItem(storagePrefix() + id);
      localStorage.removeItem(accessKey(id));
    } catch {}
    return;
  }
  memory.set(id, character);
  if (draft?.id === id) Object.assign(draft, character);
  try {
    localStorage.setItem(storagePrefix() + id, JSON.stringify(character));
    return true;
  } catch {
    return false;
  }
}

function write() {
  if (user) draft.cloudDirty = true;
  const stored = cacheCharacter(draft);
  characterSync?.schedule(draft.id);
  return stored;
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
    .map((character) => ({
      character,
      recentAt: Math.max(lastOpened(character.id), character.updatedAt ?? 0),
    }))
    .sort((a, b) => b.recentAt - a.recentAt)
    .map(({ character }) => character);
}

const classLevels = (classes) =>
  classes.map(({ entry, levels }) => `${displayName(entry)} nível ${levels.length}`).join(' · ');

const classEmblems = new Set('artificer barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard'.split(' '));
const classEmblemOverrides = {
  cleric: 'class-cross',
  sorcerer: 'class-wand',
  wizard: 'class-wizard-hat',
  fighter: 'slashing',
};
const categoryEmblems = {
  classes: 'ability-book', subclasses: 'shield', species: 'species',
  backgrounds: 'background', magias: 'class-wand',
  feats: 'radiant', items: 'weapon', tools: 'artificer', languages: 'ability-book',
  rules: 'background', glossary: 'ability-book', creatures: 'dragonborn',
};
const ruleEmblems = {
  attack: 'slashing',
  dash: 'ability-boot',
  disengage: 'ability-boot',
  dodge: 'shield',
  help: 'cleric',
  hide: 'rogue',
  influence: 'ability-jester',
  magic: 'class-wand',
  ready: 'fighter',
  search: 'divination',
  study: 'ability-book',
  utilize: 'artificer',
};
const speciesEmblems = new Set('aasimar dragonborn dwarf elf gnome goliath halfling human orc tiefling'.split(' '));
const speciesEmblemOverrides = {
  boggart: 'poison',
  centaur: 'spell-steed',
  changeling: 'illusion',
  dhampir: 'species-fangs',
  faerie: 'aasimar',
  flamekin: 'fire',
  gnome: 'species-gnome',
  hexblood: 'enchantment',
  kalashtar: 'psychic',
  khoravar: 'species-khoravar',
  'lorwyn-changeling': 'transmutation',
  lupin: 'species-lupin',
  reborn: 'necromancy',
  rimekin: 'cold',
  shifter: 'species-fangs',
  warforged: 'artificer',
};
const abilityEmblems = { str: 'monk', dex: 'ability-boot', con: 'ability-heart', int: 'ability-book', wis: 'divination', cha: 'ability-jester' };

function catalogEmblem(category, entry) {
  const id = category === 'subclasses' ? classEntry(entry.class)?.id : entry.id;
  if (category === 'classes' || category === 'subclasses') {
    return gameIcon(classEmblemOverrides[id] ?? (classEmblems.has(id) ? id : 'weapon'), 'game-emblem');
  }
  if (category === 'species') return gameIcon(speciesEmblemOverrides[id] ?? (speciesEmblems.has(id) ? id : 'species'), 'game-emblem');
  if (category === 'backgrounds') return gameIcon('background', 'game-emblem');
  if (category === 'magias') return spellIcon(entry);
  return gameIcon(categoryEmblems[category] ?? 'ability-book', 'game-emblem');
}

function characterEmblem(classes) {
  return classes.length ? catalogEmblem('classes', classes[0].entry) : gameIcon('species', 'game-emblem');
}

function characterList(characters) {
  const query = normalizeSearch(characterFilter);
  const filtered = characters.filter((character) =>
    normalizeSearch(
      title(character) + ' ' + classLevels(plannedClasses(character, catalog))
    ).includes(query)
  );
  return `<section class="panel"><header class="section-heading"><h2>Minhas fichas</h2><span>${user ? 'Fichas da conta' : 'Salvas neste navegador'}</span></header>
    ${
      filtered.length
        ? `<ul class="character-list">${filtered
            .map(
              (character) => `<li>
      <a href="${characterLink(character)}" ${characterTarget(character)}>
        <span class="icon-label">${characterEmblem(plannedClasses(character, catalog))}<span><strong>${escape(title(character))}</strong><small>
          ${escape(classLevels(plannedClasses(character, catalog)) || 'Classe a escolher')} · Nível total ${classPlan(character).length}
        </small></span></span><span class="tag">${character.saved ? 'Ficha' : 'Rascunho'}${character.cloudDirty ? ' · sincronização pendente' : ''}</span></a>
        <button class="button secondary character-delete" type="button" data-delete-character="${escape(character.id)}">Excluir</button></li>`
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
    ['inicio', 'Início', 'shield'],
    ['personagens', 'Personagens', 'human'],
    ['galeria', 'Galeria pública', 'species'],
    ['compendio', 'Compêndio', 'wizard'],
  ];
  return `<nav class="hub-nav" aria-label="Painel">${tabs
    .map(
      ([id, label, icon]) => `<a class="icon-label" href="#${id}" ${id === page ? 'aria-current="page"' : ''}>${gameIcon(icon)}${label}</a>`
    )
    .join('')}<a class="icon-label" href="#novo" target="_blank" rel="noopener"><span aria-hidden="true">+</span>Criar personagem</a></nav>`;
}

function hubShell(page, content) {
  return `<div class="hub-shell ${page === 'inicio' ? 'hub-home' : ''}"><div class="hub-sidebar">${workspaceNav(page)}
    </div><div class="hub-content">${content}</div></div>`;
}

function avatarMarkup(avatar) {
  const image = typeof avatar === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar);
  return `<span class="profile-icon" aria-hidden="true">${image ? `<img src="${escape(avatar)}" alt="">` : ''}</span>`;
}

function publicAuthor({ authorName, authorAvatar }) {
  return authorName
    ? `<span class="public-author">${avatarMarkup(authorAvatar)}<span>Por ${escape(authorName)}</span></span>`
    : '';
}

function publicGallery(page) {
  if (gallery?.page !== page) {
    const request = { page };
    gallery = request;
    const refresh = () => {
      if (gallery === request && location.hash.startsWith('#galeria')) route();
    };
    characterRequest('/public?page=' + page, {}, false)
      .then((result) => Object.assign(request, result))
      .catch(() => { request.error = true; })
      .finally(refresh);
  }
  const { documents, hasMore, error } = gallery;
  const content = error
    ? '<p>Não foi possível carregar a galeria.</p><button type="button" class="button secondary" data-retry-gallery>Tentar novamente</button>'
    : !documents
      ? '<p role="status">Carregando fichas públicas…</p>'
      : documents.length
        ? `<ul class="character-list">${documents.map((character) => `<li>
          <a href="#publica/${escape(character.id)}"><span class="icon-label">${characterEmblem(plannedClasses(character, catalog))}<span><strong>${escape(title(character))}</strong>
            <small>${escape(classLevels(plannedClasses(character, catalog)))} · Nível total ${classPlan(character).length}</small>
            ${publicAuthor(character)}
          </span></span></a></li>`).join('')}</ul>`
        : '<p class="muted">Nenhuma ficha pública nesta página.</p>';
  return hubShell('galeria', `<section class="panel"><h1>Galeria pública</h1>${content}
    <div class="hub-actions">
      ${page > 1 ? `<a class="button secondary" href="#galeria/${page - 1}">Página anterior</a>` : ''}
      ${hasMore ? `<a class="button secondary" href="#galeria/${page + 1}">Próxima página</a>` : ''}
    </div></section>`);
}

function home() {
  const characters = savedCharacters();
  const featured = characters[0];
  const entry = featured && projectCharacter(featured, catalog);
  const stats = featured && deriveCharacter(featured, entry, catalog);
  const health = featured && playResources(featured, stats);
  return `<div class="hub-grid"><div class="hub-main">
    <section class="hero hub-hero"><div>
      ${user ? '<p class="eyebrow">Bem-vindo de volta</p>' : ''}
      <h1>${user ? escape(user.username) : 'Bem-vindo ao Grimório'}</h1>
      <div class="hub-actions">${featured ? '<a class="button primary" href="#personagens">Ver meus personagens</a>' : ''}
      ${createLink(featured ? 'secondary' : 'primary')}</div></div></section>
      ${
        featured
          ? `<section class="panel hub-feature">
        <header class="hub-character">
          ${characterEmblem(entry.classes)}
          <div><h2>${escape(title(featured))}</h2>
          <p class="muted">${escape([entry.species && displayName(entry.species), classLevels(entry.classes) || 'Classe a escolher'].filter(Boolean).join(' · '))}</p></div>
          <div class="hub-character-actions">
            ${featured.saved ? `<a class="button secondary icon-label" href="${characterLink(featured)}" ${characterTarget(featured)}>${gameIcon('ability-book')}Abrir ficha</a>` : ''}
            <a class="button secondary icon-label" href="#personagem/${escape(featured.id)}/origem">${gameIcon('artificer')}Editar ficha</a>
          </div>
          <dl class="hub-vitals">
            <div><dt>${gameIcon('ability-heart')} Pontos de vida</dt><dd>${health.currentHP} / ${stats.maximumHP}</dd>
              <meter min="0" max="${Math.max(1, stats.maximumHP)}" value="${health.currentHP}" aria-label="Pontos de vida"></meter></div>
            <div><dt>${gameIcon('shield')} Classe de Armadura</dt><dd>${stats.armorClass}</dd></div>
            <div><dt>${gameIcon('ability-boot')} Deslocamento</dt><dd>${stats.speed} pés</dd></div>
          </dl>
        </header>
        <dl class="scores sheet-scores hub-scores">${abilities
          .map(
            ([id, , label]) => `<div data-ability="${id}"><dt class="icon-label">${gameIcon(abilityEmblems[id])}${label}</dt><dd>${entry.scores[id]}
          <small>${plus(modifier(entry.scores[id]))}</small></dd></div>`
          )
          .join('')}</dl>
        ${skillPanel(stats.skills)}</section>`
          : '<section class="panel hub-empty"><h2>Seu primeiro personagem</h2><p class="muted">Crie uma ficha para ver os atributos e as perícias aqui.</p></section>'
      }
    </div><aside class="hub-rail" aria-label="Personagens e atalhos">
    <section class="panel hub-recent"><header class="section-heading"><h2>Personagens</h2></header>
      ${characters.length ? `<ul class="character-list">${characters.slice(0, 4).map((character) => {
        const classes = plannedClasses(character, catalog);
        return `<li><a href="${characterLink(character)}" ${characterTarget(character)}>
          ${characterEmblem(classes)}<span><strong>${escape(title(character))}</strong>
          <small>${escape(classLevels(classes) || 'Classe a escolher')}</small></span><span aria-hidden="true">›</span>
        </a></li>`;
      }).join('')}</ul>` : '<p class="muted">Nenhum personagem criado.</p>'}
      <a class="navigation-row" href="#personagens">${gameIcon('species', 'game-emblem')}<span>Ver todos os personagens</span><span aria-hidden="true">›</span></a>
    </section>
    <section class="panel hub-shortcuts"><h2>Atalhos</h2>
      ${[
        ['#compendio/classes', 'ability-book', 'Consultar classes'],
        ['#compendio/magias', 'class-wand', 'Consultar magias'],
        ['#compendio/rules', 'background', 'Consultar regras'],
        ...(guest ? [['#login', 'human', 'Entrar ou criar conta']] : []),
      ].map(([href, icon, label]) => `<a class="navigation-row" href="${href}">
        ${gameIcon(icon, 'game-emblem')}<span>${label}</span><span aria-hidden="true">›</span>
      </a>`).join('')}
    </section></aside></div>`;
}

const compendiumTabs = [
  ['classes', 'Classes'],
  ['subclasses', 'Subclasses'],
  ['species', 'Espécies'],
  ['backgrounds', 'Antecedentes'],
  ['magias', 'Magias'],
  ['feats', 'Talentos'],
  ['items', 'Itens e equipamentos'],
  ['tools', 'Ferramentas'],
  ['languages', 'Idiomas'],
  ['rules', 'Regras'],
  ['glossary', 'Glossário'],
  ['creatures', 'Criaturas e invocações'],
];

function spellFilterControls(prefix, spells, filters = {}) {
  const levels = [...new Set(spells.map(({ level }) => level))].sort((a, b) => a - b);
  const schools = Object.entries(spellSchools)
    .filter(([id]) => spells.some(({ school }) => school === id))
    .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'));
  const publications = [
    ...new Set(spells.map(({ publication }) => publication).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const damage = [...new Set(spells.flatMap(spellDamageTypes))]
    .map((type) => [type, damageTypeLabel(type)])
    .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'));
  return [
    ['level', 'Círculo', 'Todos', levels.map((level) => [String(level), spellCircle(level)])],
    ['school', 'Escola', 'Todas', schools],
    ['publication', 'Fonte', 'Todas', publications.map((book) => [book, book])],
    ['damage', 'Tipo de dano', 'Todos', damage],
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
      : catalog[catalogCategory].filter(
          (entry) =>
            (!catalogSource || entry.source === catalogSource) &&
            normalizeSearch(
              [
                displayName(entry),
                entry.name,
                entry.source,
                entry.translation?.body,
                entry.translation?.text,
                entry.body,
                entry.text,
              ]
                .filter(Boolean)
                .join(' ')
            ).includes(query)
        );
  return `<p class="muted">${entries.length} resultados</p>
    ${sortEntries(entries)
      .slice(0, catalogLimit)
      .map((entry) => articleLink(catalogCategory, entry))
      .join('')}
    ${entries.length > catalogLimit ? '<button type="button" class="button secondary" data-more>Mostrar mais</button>' : ''}`;
}

function articleLink(category, entry, note = '') {
  const tags = category === 'magias'
    ? spellTagMarkup(entry)
    : [category === 'subclasses' && classLabel(entry.class), featCategories[entry.category], entry.source]
      .filter(Boolean).map((tag) => `<span class="tag">${escape(tag)}</span>`).join(' ');
  return `<a class="navigation-row wiki-result" href="${compendiumHref(category, entry.id)}">
    ${catalogEmblem(category, entry)}
    <span class="wiki-result-content"><strong>${escape(displayName(entry))}</strong>
      ${note ? `<small>${escape(note)}</small>` : ''}
      ${tags ? `<span class="entry-tags">${tags}</span>` : ''}
    </span><span aria-hidden="true">›</span>
  </a>`;
}

function globalSearch(encodedQuery) {
  let query = '';
  try {
    query = decodeURIComponent(encodedQuery ?? '').trim();
  } catch {
    return '<section class="panel"><h1>Busca</h1><p>Digite um termo no campo de busca.</p></section>';
  }
  const heading = `<h1>Busca${query ? ' por “' + escape(query) + '”' : ''}</h1>`;
  if (!query) return `<section class="panel">${heading}<p>Digite um termo no campo de busca.</p></section>`;
  const terms = normalizeSearch(query).split(/\s+/);
  const matches = (...values) => {
    const label = normalizeSearch(values.filter(Boolean).join(' '));
    return terms.every((term) => label.includes(term));
  };
  const groups = compendiumTabs.map(([category, label]) => {
    const entries = category === 'magias' ? catalog.spells : catalog[category];
    const results = sortEntries(entries.filter((entry) => matches(
      displayName(entry), entry.name, entry.source, entry.publication, label
    )));
    return [label, results.map((entry) => articleLink(category, entry))];
  });
  if (user || guest) {
    const characters = savedCharacters().flatMap((character) => {
      const classes = plannedClasses(character, catalog);
      const label = classLevels(classes);
      if (!matches(title(character), label)) return [];
      return [`<a class="entry wiki-link" href="${characterLink(character)}" ${characterTarget(character)}>
        <strong class="icon-label">${characterEmblem(classes)}${escape(title(character))}</strong>
        <small>${escape(label)}</small></a>`];
    });
    groups.unshift(['Meus personagens', characters]);
  }
  const total = groups.reduce((count, [, entries]) => count + entries.length, 0);
  return `<section class="panel global-search">${heading}
    ${total ? `<p class="muted">${total} ${total === 1 ? 'resultado' : 'resultados'}</p>
      ${groups.filter(([, entries]) => entries.length).map(([label, entries]) =>
        `<details class="global-search-group" ${total <= 40 ? 'open' : ''}>
          <summary>${label} <span class="tag">${entries.length}</span></summary>
          <div class="compendium-results">${entries.join('')}</div>
        </details>`).join('')}` : '<p>Nenhum resultado encontrado.</p>'}
  </section>`;
}

function compendium(articleId) {
  return `<section class="panel compendium"><h1>Compêndio</h1>
    <nav class="hub-nav" aria-label="Categorias">${compendiumTabs
      .map(
        ([id, label]) =>
          `<a class="icon-label" href="#compendio/${id}" ${id === catalogCategory ? 'aria-current="page"' : ''}>${gameIcon(categoryEmblems[id])}${label}</a>`
      )
      .join('')}</nav>
    ${
      articleId
        ? compendiumArticle(articleId)
        : `<div class="compendium-filters"><div><label for="catalog-search">Buscar no compêndio</label>
      <input id="catalog-search" type="search" value="${escape(catalogFilter)}"></div>
      ${
        catalogCategory !== 'magias'
          ? `<div><label for="catalog-source">Livro</label>
        <select id="catalog-source"><option value="">Todos</option>${[
          ...new Set(catalog[catalogCategory].map(({ source }) => source).filter(Boolean)),
        ]
          .sort()
          .map(
            (source) =>
              `<option ${catalogSource === source ? 'selected' : ''} value="${escape(source)}">${escape(source)}</option>`
          )
          .join('')}</select></div>`
          : ''
      }
      ${catalogCategory === 'magias' ? spellFilterControls('catalog', catalog.spells, catalogSpellFilters) : ''}
    </div>
      <div class="compendium-results" id="compendium-results">${compendiumResults()}</div>
      <details class="entry"><summary>Cobertura e fontes do catálogo</summary>
        ${[...new Set(catalog.content.map(({ source }) => source).filter(Boolean))]
          .sort()
          .map((source) => {
            const entries = catalog.content.filter((entry) => entry.source === source);
            return `<p><strong>${escape(source)}</strong> · ${entries.length} opções de personagem</p>`;
          })
          .join('')}
        <p>${catalog.creatures.length} fichas de criaturas e invocações. O bestiário usa as criaturas do SRD 5.2.1 e os blocos complementares citados pelas opções de personagem.</p>
        <p>Traduções comunitárias e automáticas. Os textos originais acompanham os verbetes.</p>
        <ul class="wiki-class-links">${[
          ['https://www.dndbeyond.com/srd', 'SRD da Wizards of the Coast'],
          ['https://github.com/5etools-mirror-3/5etools-src', 'Catálogo de referência'],
          ['https://github.com/decito/dnd5e-pt-br', 'Traduções comunitárias'],
        ].map(([href, label]) => `<li><a class="navigation-row" href="${href}" target="_blank" rel="noopener">
          ${gameIcon('ability-book', 'game-emblem')}<span>${label}</span><span aria-hidden="true">↗</span>
        </a></li>`).join('')}</ul>
      </details>`
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
  const back = `<a class="button secondary icon-label" href="#compendio/${catalogCategory}"><span aria-hidden="true">←</span>Voltar para ${compendiumTabs.find(([id]) => id === catalogCategory)[1].toLowerCase()}</a>`;
  if (!entry) return `<p>${back}</p><p>Verbete não encontrado no catálogo.</p>`;
  const related = catalogCategory === 'classes' ? classArticles(entry, catalog) : undefined;
  const parent = entry.class && classEntry(entry.class);
  const classLinks = (entry.classes ?? []).map(classEntry).filter(Boolean);
  const lore = entry.lore ?? [];
  const progression = classProgression(entry);
  const isCharacterArticle = ['classes', 'subclasses', 'species'].includes(catalogCategory);
  const isReference = ['rules', 'glossary'].includes(catalogCategory);
  const relatedRules = isReference ? (entry.related ?? []).flatMap((key) => {
    const rule = catalog.rules.find(({ id }) => id === key);
    return rule ? [rule] : [];
  }) : [];
  document.title = displayName(entry) + ' · Compêndio · Grimório';
  return `<article class="wiki-article ${isCharacterArticle ? 'wiki-character-article' : ''} ${isReference ? 'wiki-reference' : ''}">
    <nav class="wiki-breadcrumb" aria-label="Navegação do verbete">${back}${parent ? `<a class="button secondary icon-label" href="${compendiumHref('classes', parent.id)}">${catalogEmblem('classes', parent)}${escape(displayName(parent))}</a>` : ''}</nav>
    <header class="wiki-article-header"><h2 class="icon-label">${catalogEmblem(catalogCategory, entry)}${escape(displayName(entry))}</h2>
      ${isSpell
        ? `<div class="picker-tags">${spellTagMarkup(entry)}</div>`
        : `<p class="muted">${[featCategories[entry.category], entry.source].filter(Boolean).map(escape).join(' · ')}</p>`}
    </header>
    ${isSpell ? spellDescription(entry, { glossary: true }) : isReference
      ? `<section class="wiki-reference-body">${entryDescription(entry, true, true, ruleReference)}</section>`
      : optionDetails(entry, true, isCharacterArticle)}
    ${relatedRules.length ? `<section><h3>Regras relacionadas</h3><ul class="wiki-class-links">${relatedRules.map((rule) =>
      `<li>${articleLink('rules', rule)}</li>`).join('')}</ul></section>` : ''}
    ${classLinks.length ? `<section><h3>Listas de classe</h3><ul class="wiki-class-links">${classLinks.map((cls) =>
      `<li>${articleLink('classes', cls)}</li>`).join('')}</ul></section>` : ''}
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
    ${related?.subclasses.length ? `<section><h3>Subclasses</h3><ul class="wiki-class-links">${related.subclasses.map((entry) =>
      `<li>${articleLink('subclasses', entry)}</li>`).join('')}</ul></section>` : ''}
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

function ruleReference(id, label) {
  const normalizeTerm = (value) => normalizeSearch(value).trim().replace(/[-\s]+/g, '-');
  const terms = [normalizeTerm(id), normalizeTerm(label)];
  for (const category of ['rules', 'glossary']) {
    const entries = catalog[category];
    const target = entries.find((entry) => entry.id === id)
      ?? entries.find((entry) => terms.includes(normalizeTerm(displayName(entry))));
    if (target) return {
      href: compendiumHref(category, target.id),
      icon: ruleEmblems[target.id] ?? categoryEmblems[category],
    };
  }
}

function entryDescription(entry, full = false, glossary = false, referenceLink) {
  const fields = full ? ['body', 'text', 'summary'] : ['body', 'summary', 'text'];
  const field = fields.find((key) => entry[key] || entry.translation?.[key]);
  if (!field) return '';
  const original = entry[field];
  const translation = entry.translation?.[field];
  const needsTableFallback = translation && !entry.translation.statBlocks?.length;
  const localizedTables = needsTableFallback
    ? rulesDescriptionParts(translation).filter(({ columns }) => columns)
    : [];
  const originalTables = needsTableFallback
    ? rulesDescriptionParts(original).filter(({ columns }) => columns)
    : [];
  const missingTables = originalTables.filter(({ columns, rows }, index) => {
    const localized = localizedTables[index] ?? entry.translation.tables?.[index];
    return (
      !localized ||
      columns.length !== localized.columns.length ||
      rows.length !== localized.rows.length
    );
  });
  return `${formatRulesDescription(translation ?? original, glossary, translation ? 'pt-BR' : 'en', referenceLink)}
    ${missingTables.map(({ columns, rows }) => rulesTable(columns, rows, glossary, 'en')).join('')}
    ${
      original && translation && translation !== original
        ? originalDescription(entry.name, original, glossary, referenceLink)
        : ''
    }`;
}

function referenceDetails(entry, glossary) {
  const { statBlocks = [], tables = entry.tables ?? [] } = entry.translation ?? {};
  const spell = entry.spell && catalog.bySpell.get(entry.spell);
  return `${tables.map(({ columns, rows }) => rulesTable(columns, rows, glossary)).join('')}
    ${
      entry.references
        ?.map((reference) =>
          displayName(reference) === displayName(entry)
            ? entryDescription(reference, true, glossary)
            : details(reference, glossary)
        )
        .join('') ?? ''
    }
    ${
      statBlocks.length
        ? `<section class="feature-references" aria-label="Blocos de estatísticas">
      ${statBlocks.map(({ name, ...translation }) => details({ name, translation }, glossary)).join('')}
    </section>`
        : ''
    }
    ${glossary && spell ? `<p>${articleLink('magias', spell)}</p>` : ''}`;
}

function details(entry, glossary = false, full = false) {
  return `<details class="entry"><summary><strong>${escape(displayName(entry))}</strong>
    ${entry.level ? `<span class="tag">Nível ${entry.level}</span>` : ''}
    ${(entry.translation?.tags ?? []).map((tag) => `<span class="tag">${escape(tag)}</span>`).join('')}</summary>
    ${entry.source ? `<p class="muted">${escape(entry.source)}</p>` : ''}
    ${entryDescription(entry, full, glossary)}
    ${entry.options?.length ? `<div class="feature-references">${entry.options.map((option) => details(option, glossary)).join('')}</div>` : ''}
    ${referenceDetails(entry, glossary)}
    ${
      (glossary || entry.key) && entry.invocations?.length
        ? `<button class="button secondary" type="button"
      id="picker:warlock-invocations" data-picker="warlock-invocations" aria-haspopup="dialog">
      Ver todas as ${entry.invocations.length} invocações
    </button>`
        : ''
    }
    ${entry.prereq?.text ? `<p class="muted">Pré-requisito: ${escape(prerequisiteText(entry, catalog))}</p>` : ''}
    ${glossary ? wikiBenefits(entry) : ''}
    ${
      entry.key && !publicSheet
        ? `<div class="feature-note"><label for="${escape(entry.key)}">Registrar escolha ou anotação</label>
      <input id="${escape(entry.key)}" name="feature-note" data-feature="${escape(entry.key)}" maxlength="500"
        value="${escape(draft.featureNotes?.[entry.key])}" placeholder="Ex.: uma opção descrita nesta habilidade"></div>`
        : ''
    }
    ${publicSheet && entry.key && draft.featureNotes?.[entry.key] ? `<p class="description">${escape(draft.featureNotes[entry.key])}</p>` : ''}
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
  const spellAction = group.name.startsWith('Substituir') || group.name.startsWith('Trocar') || group.name.startsWith('Revisar')
    ? group.name
    : group.name.startsWith('Preparar') ? (selected.length ? 'Revisar novas magias' : group.name)
      : group.name.startsWith('Nova magia') ? action + ' magia substituta'
        : action + ' ' + group.name.toLocaleLowerCase('pt-BR');
  return `<div class="picker-control">
    <button type="button" class="button secondary" id="picker:${escape(group.key)}" data-picker="${escape(group.key)}"
      aria-haspopup="dialog">${escape(group.spellPicker ? spellAction : action + ' ' + group.name)}</button>
    ${
      selected.length
        ? `<ul class="chips" aria-label="${escape(group.name)}">
      ${selected.map((entry) => {
        const spell = group.spellPicker && catalog.bySpell.get(entry.id);
        return spell
          ? `<li class="icon-label">${spellIcon(spell)}${escape(spellName(spell))}</li>`
          : `<li>${escape(displayName(entry))}</li>`;
      }).join('')}</ul>`
        : ''
    }
  </div>`;
}

function choiceBlock(group) {
  return `<fieldset class="choice ${group.depth ? 'nested' : ''}">
    <legend>${escape(group.source)}${group.section === 'progressao' ? ` · Nível de classe ${group.level}` : ''}</legend>
    <p class="choice-count">${group.optional ? `${group.selected.length} escolhidas · opcional` : `${group.selected.length}/${group.count} escolhidas`}</p>
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
      value: [...projection.tools].map((id) => displayName(catalog.byTool.get(id) ?? { id, name: id })).join(', '),
    },
    {
      name: 'Idiomas',
      value: [...projection.languages]
        .map((id) => displayName(catalog.byLanguage.get(id) ?? { id, name: id }))
        .join(', '),
    },
    { name: 'Alinhamento', value: catalog.alignments.find(({ id }) => id === draft.alignment) &&
      displayName(catalog.alignments.find(({ id }) => id === draft.alignment)) },
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
        ? `<details class="entry" aria-label="Antecedente selecionado">
      <summary><strong>Benefícios de ${escape(displayName(projection.background))}</strong></summary>
      ${optionDetails(projection.background)}
    </details>`
        : ''
    }
    <div>${select(
      'campaign',
      'Cenário de campanha (opcional)',
      campaigns.map((name) => ({ id: name, name })),
      draft.campaign
    )}</div>
    <div class="builder-choices">${projection.groups
      .filter(({ section }) => section === 'origem')
      .map(choiceBlock)
      .join('')}</div>
    <details class="entry"><summary>Características da origem</summary>${benefits('origem')}</details>`;
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
  const issue = attributeIssue(draft);
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
      <span class="score-label icon-label" id="score-label-${id}">${gameIcon(abilityEmblems[id])}${label}</span>
      ${scoreControl(id, label)}
      <small>Final <strong>${projection.scores[id]}</strong> · ${plus(modifier(projection.scores[id]))}</small></div>`;
      })
      .join('')}</div>`;
}

let progressionLevel;

function progression() {
  const groups = projection.groups.filter(({ section }) => section === 'progressao');
  const plan = classPlan(draft);
  const requirements = progressionRequirements(draft, projection);
  const active = Math.min(progressionLevel ?? plan.length, plan.length);
  return `<h2>Classe e níveis</h2><p class="muted">A cada nível, avance em uma classe que já tem ou escolha uma nova.</p>
    <p><strong>Nível total ${plan.length}</strong>${projection.classes.length ? ` · ${escape(classLevels(projection.classes))}` : ''}</p>
    ${requirements.length ? `<p class="score-error" role="alert">${escape(requirements.join('. '))}.</p>` : ''}
    ${plan
      .map((id, index) => {
        const level = index + 1;
        const track = projection.classes.find(({ entry }) => entry.id === id);
        const label =
          track && `${displayName(track.entry)} nível ${track.levels.indexOf(level) + 1}`;
        const expanded = level === active;
        return `<section class="level"><h3><button class="button secondary level-heading" type="button" data-open-level="${level}" aria-expanded="${expanded}">Nível total ${level}${label ? ` · ${escape(label)}` : ''}</button></h3>
      ${expanded ? `<div class="score-actions level-actions">
      <button type="button" class="button secondary" id="picker:class-level/${index}" data-picker="class-level/${index}"
        aria-haspopup="dialog">${id ? 'Trocar' : 'Escolher'} classe do nível ${level}</button>
      ${plan.length < 20 && plan.every(Boolean) ? `<button type="button" class="button primary" id="picker:class-level/${plan.length}" data-picker="class-level/${plan.length}" aria-haspopup="dialog">Subir para o nível ${plan.length + 1}</button>` : ''}
      ${level === plan.length && level > 1 ? '<button type="button" class="button secondary" data-remove-level>Remover último nível</button>' : ''}
      </div>
      <div class="builder-choices">${groups
        .filter((group) => group.characterLevel === level)
        .map(choiceBlock)
        .join('')}</div>` : ''}</section>`;
      })
      .join('')}
    <details class="entry"><summary>Características de classe</summary>${benefits('progressao')}</details>`;
}

function missingChoices() {
  return characterIssues(draft, projection, catalog);
}

function skillPanel(skills, playable = false) {
  return `<section class="hub-skills"><h3>Perícias</h3><dl>${skills.map(({ id, name, bonus, proficient, expertise, disadvantage }) =>
    `<div><dt>${proficient || expertise ? `<span class="hub-proficient" title="${expertise ? 'Especialização' : 'Proficiente'}">●</span>` : ''}${escape(name)}${disadvantage ? ' <small>· Desvantagem</small>' : ''}</dt>
    <dd>${playable ? `<button class="text-button" type="button" data-play="skill" data-check="${escape(id)}" aria-label="Rolar ${escape(name)}">${plus(bonus)}</button>` : plus(bonus)}</dd></div>`
  ).join('')}</dl></section>`;
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
    ${facts()}${skillPanel(deriveCharacter(draft, projection, catalog).skills)}`;
}

function rollCheck(bonus, disadvantage) {
  if (!disadvantage) return rollDice(1, 20, bonus);
  const { dice } = rollDice(2, 20);
  const kept = Math.min(...dice);
  return { dice: [kept], discarded: Math.max(...dice), disadvantage: true, sides: 20, bonus, total: kept + bonus };
}

function withSpellAbility(spell, calculated) {
  const ability = spell.castingAbility;
  if (!ability) return spell;
  const modifier = calculated.modifiers[ability];
  return {
    ...spell,
    castingModifier: modifier,
    saveDC: 8 + calculated.proficiency + modifier + calculated.spellSaveBonus,
    attackBonus: calculated.proficiency + modifier + calculated.spellAttackBonus,
  };
}

function showDice(rolls) {
  clearTimeout(diceTimer);
  if (dicePopup.open) dicePopup.close();
  const orientations = [[0, 0], [0, -90], [-90, 0], [90, 0], [0, 90], [0, 180]];
  const renderDie = (value, sides) => {
    if (sides !== 6) return `<span class="other-die">${value}</span>`;
    const [x, y] = orientations[value - 1];
    return `<span class="die-scene">
      <span class="die-cube" style="--rx:${x}deg;--ry:${y}deg">
        ${orientations.map((_, face) => `<span class="die-face die-${face + 1}">${face + 1}</span>`).join('')}
      </span></span>`;
  };
  diceResults.innerHTML = rolls.map(({ label, dice, bonus = 0, total, discarded }) =>
    `<div class="dice-result">
      <span><strong>${escape(label)}</strong> · ${dice.join(' + ')}${bonus ? ' ' + plus(bonus) : ''}${discarded ? ` · descarta ${discarded}` : ''} = <strong>${total}</strong></span>
    </div>`
  ).join('');
  const reveal = () => {
    diceBoard.hidden = true;
    diceBoard.replaceChildren();
    dicePopup.showModal();
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reveal();
    return;
  }
  const pieces = rolls.flatMap(({ dice, sides, discarded, disadvantage }) =>
    disadvantage
      ? [...dice.map((value) => ({ value, sides })), { value: discarded, sides, dropped: true }]
      : dice.map((value, index) => ({ value, sides, dropped: index === dice.indexOf(discarded) }))
  ).slice(0, 30);
  const columns = Math.min(pieces.length, innerWidth < 550 ? 4 : 6);
  const rows = Math.ceil(pieces.length / columns);
  diceBoard.innerHTML = pieces.map(({ value, sides, dropped }, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 15 + 70 * (column + 0.5) / columns;
    const y = 22 + 56 * (row + 0.5) / rows;
    const fromLeft = index % 2 === 0;
    return `<span class="board-die${dropped ? ' discarded-die' : ''}"
      style="--x:${x}vw;--y:${y}dvh;--entry-x:${fromLeft ? -9 : 108}vw;--entry-y:${fromLeft ? 82 : 16}dvh;--drift:${fromLeft ? 5 : -5}vw;--delay:${index * 22}ms">
      ${renderDie(value, sides)}</span>`;
  }).join('');
  diceBoard.hidden = false;
  diceTimer = setTimeout(reveal, 1130 + (pieces.length - 1) * 22);
}

function playPanel(calculated) {
  const resources = playResources(draft, calculated);
  const { currentHP, temporaryHP, hitDice, slots, shortRest } = resources;
  const weapons = equippedWeaponRolls(projection, calculated);
  const castable = projection.spells.map((entry, index) => ({ spell: withSpellAbility(entry, calculated), index }))
    .filter(({ spell }) => spellCastingOptions(spell, resources, draft.play ?? {}).length);
  return `<div class="combat-columns">
    <section class="play-panel"><div class="section-heading"><h3>Pontos de vida</h3>
      ${classPlan(draft).length < 20 ? `<a class="button secondary" href="${link('progressao')}">Subir de nível</a>` : ''}
    </div>
    <p><strong>${currentHP} / ${calculated.maximumHP} PV</strong> · ${temporaryHP} temporários</p>
    <div class="play-actions">
      <label>Quantidade <input id="play-hp" data-play-control type="number" min="0" max="10000" value="1"></label>
      <button type="button" class="button secondary" data-play="damage">Sofrer dano</button>
      <button type="button" class="button secondary" data-play="heal">Curar</button>
      <button type="button" class="button secondary" data-play="temporary">Definir PV temporários</button>
    </div>
    <div class="play-actions">
      <button type="button" class="button secondary" data-play="short" ${!currentHP && !shortRest ? 'disabled' : ''}>${shortRest ? 'Concluir descanso curto' : 'Iniciar descanso curto'}</button>
      <button type="button" class="button secondary" data-play="long" ${!currentHP ? 'disabled' : ''}>Descanso longo</button>
    </div>
    ${currentHP === 0 ? '<p>Com 0 PV, você precisa recuperar pelo menos 1 PV antes de iniciar um descanso.</p>' : ''}
    <div class="play-actions"><strong>Dados de Vida</strong>
      ${hitDice.map(({ sides, remaining, maximum }) => `<button type="button" class="button secondary"
        data-play="hit-die" data-sides="${sides}" ${!shortRest || !remaining ? 'disabled' : ''}>
        Gastar d${sides} · ${remaining}/${maximum}</button>`).join('')}
    </div>
    </section>
    <section class="play-panel"><h3>Ataques</h3>
    ${weapons.length ? weapons.map(({ id, name, attack, damage, type, disadvantage }) =>
      `<div class="play-actions"><strong>${escape(name)}</strong>
        <button class="button primary" type="button" data-play="weapon-attack" data-weapon="${escape(id)}">Atacar ${plus(attack)}${disadvantage ? ' · Desvantagem' : ''}</button>
        <button class="button secondary" type="button" data-play="weapon-damage" data-weapon="${escape(id)}">
          Dano ${damage.count}d${damage.sides}${damage.bonus ? ' ' + plus(damage.bonus) : ''} · ${escape(damageTypeLabel(type))}</button></div>`
    ).join('') : '<p class="muted">Nenhuma arma equipada.</p>'}
    </section>
    <section class="play-panel"><h3>Atalhos</h3>
      ${resources.armorUntrained ? '<p class="score-error">Armadura sem treinamento. Desvantagem em testes de Força e Destreza e conjuração indisponível.</p>' : ''}
      <button type="button" class="button secondary" data-play="initiative">Rolar iniciativa</button>
      <div class="play-actions"><label for="combat-skill">Perícia
        <select id="combat-skill" data-play-control>${calculated.skills.map(({ id, name, bonus }) =>
          `<option value="${escape(id)}">${escape(name)} ${plus(bonus)}</option>`).join('')}</select></label>
        <button type="button" class="button secondary" data-play="skill" data-combat-skill>Rolar perícia</button></div>
      ${castable.length ? `<div class="combat-casting">
        <label for="combat-spell">Magia rápida</label>
        <select id="combat-spell" data-play-control>${castable.map(({ spell, index }) =>
          `<option value="${index}">${escape(spellName(spell))}</option>`).join('')}</select>
        <div id="combat-spell-actions">${spellPlayActions(castable[0].spell, castable[0].index, resources)}</div>
      </div>` : ''}
      ${projection.spells.length ? '<button type="button" class="button secondary" data-sheet-jump="magias">Ver todas as magias</button>' : ''}
      ${slots.length ? `<p><strong>Espaços disponíveis</strong> · ${slots.map(({ pact, level, remaining, maximum }) =>
        `${pact ? 'Pacto ' : ''}${level}º círculo ${remaining}/${maximum}`).join(' · ')}</p>` : ''}
    </section>
  </div>`;
}

function spellCastingOptions(spell, resources, play) {
  if (resources.armorUntrained) return [];
  if (spell.level === 0) return [{ key: 'cantrip', label: 'Truque', level: 0 }];
  const options = [];
  if (spell.ritual) options.push({ key: 'ritual', label: 'Ritual', level: spell.level });
  if (spell.ritualOnly || spell.preparation === 'spellbook') return options;
  if (spell.atWill) options.push({ key: 'at-will', label: 'Sem gastar espaço', level: spell.level });
  if (spell.free) {
    const key = `${spell.free.per}:${spell.originKey ?? spell.grantedBy ?? ''}/${spell.id}`;
    const remaining = spell.free.uses - (play.free?.[key] ?? 0);
    if (remaining > 0) options.push({ key, label: `Uso gratuito (${remaining})`, level: spell.level });
  }
  if (!spell.atWill && !spell.freeOnly)
    for (const slot of resources.slots.filter(({ level, remaining }) => level >= spell.level && remaining > 0))
      options.push({ key: slot.key, label: `${slot.pact ? 'Pacto' : 'Espaço'} · ${slot.level}º círculo (${slot.remaining})`, level: slot.level });
  return options;
}

function spellPlayActions(spell, index, resources) {
  const options = spellCastingOptions(spell, resources, draft.play ?? {});
  const level = lastCast?.character === draft.id && lastCast.index === index && lastCast.spellId === spell.id
    ? lastCast.level
    : spell.level;
  const rolls = spellRolls(spell, classPlan(draft).length, level);
  return `<div class="play-actions spell-actions" data-spell-index="${index}">
    ${options.length ? `<label>Conjurar com <select aria-label="Recurso para conjurar ${escape(spellName(spell))}" data-play-control>
      ${options.map(({ key, label }) => `<option value="${escape(key)}">${escape(label)}</option>`).join('')}
    </select></label><button type="button" class="button primary" data-play="cast">Conjurar</button>` : `<span class="muted">${resources.armorUntrained ? 'A armadura sem treinamento impede a conjuração.' : 'Sem conjuração disponível.'}</span>`}
    ${rolls.map(({ label, type }, i) => `<button type="button" class="button secondary" data-play="spell-roll" data-roll-index="${i}">
      Rolar ${escape(label.toLowerCase())}${type ? ` · ${escape(type)}` : ''}</button>`).join('')}
  </div>`;
}

function castingSummary(calculated) {
  return `<section><h3>Conjuração</h3>
    ${calculated.casting
      .map(
        ({ name, ability, saveDC, attack, pact, slots }) =>
          `<p><strong>${escape(name)}</strong> · ${abilityLabel(ability)} · CD ${saveDC} · Ataque ${plus(attack)}
      ${
        pact
          ? `<br>Espaços de pacto · ${(slots ?? [])
              .filter(({ maximum }) => maximum)
              .map(({ level, maximum }) => `${maximum} de ${level}º círculo`)
              .join(', ')} · descanso curto ou longo`
          : ''
      }</p>`
      )
      .join('')}
    ${
      calculated.commonSlots.some(({ maximum }) => maximum)
        ? `<p><strong>Espaços de magia</strong> · ${calculated.commonSlots
            .filter(({ maximum }) => maximum)
            .map(({ level, maximum }) => `${level}º círculo × ${maximum}`)
            .join(' · ')} · descanso longo</p>`
        : ''
    }
  </section>`;
}

const narrativeLabels = {
  backstory: 'História',
  description: 'Descrição',
  personality: 'Personalidade',
  motivations: 'Motivações',
  goals: 'Objetivos',
};
function narrative() {
  return `<h2>História do personagem</h2>
    ${select('alignment', 'Alinhamento', catalog.alignments ?? [], draft.alignment)}
    ${Object.entries(narrativeLabels)
      .map(
        ([key, label]) =>
          `<label for="narrative-${key}">${label}</label><textarea id="narrative-${key}" name="narrative" data-narrative="${key}" maxlength="10000" rows="4">${escape(draft.narrative?.[key])}</textarea>`
      )
      .join('')}`;
}

function inventoryView(editable, playable = false) {
  const rows = characterInventory(draft, projection, catalog);
  return rows.length
    ? rows
        .map(
          (row) =>
            `<article class="inventory-item">
    ${(editable || playable) && equipmentSlot(row) ? `<button class="button secondary inventory-equip" type="button"
      data-equip-item="${escape(row.id)}" aria-label="${row.equipped ? 'Desequipar' : 'Equipar'} ${escape(row.name)}">${row.equipped ? 'Desequipar' : 'Equipar'}</button>` : ''}
    <details class="entry"><summary>${escape(row.quantity)}× ${escape(row.name)}
    ${row.base ? ' · ' + escape(displayName(row.base)) : ''}
    ${row.equipped ? ' · equipado' : ''}${row.attuned ? ' · sintonizado' : ''}</summary>
    ${row.item ? optionDetails(row.item) : ''}
    ${
      editable
        ? `<div class="fields two">
      <label>Quantidade<input name="inventory" data-item-key="${escape(row.id)}" data-property="quantity" type="number" min="1" max="9999" value="${row.quantity}"></label>
      ${row.item?.attunement ? `<label><input name="inventory" data-item-key="${escape(row.id)}" data-property="attuned" type="checkbox" ${row.attuned ? 'checked' : ''}> Sintonizado</label>` : ''}
      <label>Observações<input name="inventory" data-item-key="${escape(row.id)}" data-property="notes" maxlength="500" value="${escape(row.notes)}"></label>
      ${
        row.item?.baseItems?.length ||
        (row.item?.kind === 'armor' &&
          row.item.magic &&
          !row.item.ac &&
          !/shield/i.test(row.item.name))
          ? `<button type="button" class="button secondary" data-picker="inventory-base/${escape(row.id)}">Tipo de item base</button>`
          : ''
      }
      <button type="button" class="text-button" data-remove-item="${escape(row.id)}">Remover item</button>
    </div>`
        : ''
    }</details></article>`
        )
        .join('')
    : '<p>Inventário vazio.</p>';
}

function equipment() {
  const calculated = deriveCharacter(draft, projection, catalog);
  return `<h2>Equipamento</h2><p>Itens do equipamento inicial e itens adquiridos.</p>
    <p>Moedas iniciais · ${projection.equipment.reduce((sum, kit) => sum + (kit.gold ?? 0), 0) / 100} PO</p>
    <p>Limite de sintonia · ${calculated.attunementLimit}</p>
    ${calculated.warnings.map((warning) => `<p class="score-error">${escape(warning)}</p>`).join('')}
    <button type="button" class="button secondary" data-picker="inventory-add" aria-haspopup="dialog">Adicionar item</button>
    <div class="session-inventory">${inventoryView(true)}</div>`;
}

function sheet() {
  const calculated = deriveCharacter(draft, projection, catalog);
  const playable = draft.saved && !publicSheet;
  const resources = playable && playResources(draft, calculated);
  const scores = abilities
    .map(
      ([id, , name]) => `<div><dt class="icon-label">${gameIcon(abilityEmblems[id])}${name}</dt><dd>${projection.scores[id]}
    <small>${playable
      ? `<button class="text-button" type="button" data-play="ability" data-check="${id}" aria-label="Rolar teste de ${name}">${plus(calculated.modifiers[id])}</button>`
      : plus(calculated.modifiers[id])}</small></dd></div>`
    )
    .join('');
  const choices = projection.groups.filter(({ selected }) => selected.length);
  const panel = (id, content) => playable
    ? `<section class="session-pane" data-sheet-pane="${id}" aria-label="${sheetTabs.find(([key]) => key === id)[1]}" ${sheetTab !== id ? 'hidden' : ''}>${content}</section>`
    : content;
  return `${publicSheet ? `<p class="muted">${escape(classLevels(projection.classes))}</p>` : ''}
    ${playable ? panel('combate', `
      <div class="session-combat-stats">
        <span>CA <strong>${calculated.armorClass}</strong></span>
        <span>Iniciativa <strong>${plus(calculated.initiative)}</strong></span>
        <span>Deslocamento <strong>${calculated.speed} pés</strong></span>
        <span>Percepção passiva <strong>${calculated.passivePerception}</strong></span>
      </div>
      ${playPanel(calculated)}
    `) : ''}
    ${panel('testes', `<div class="session-checks"><section><dl class="scores sheet-scores">${scores}</dl>
    <dl class="facts">${[
      ['Proficiência', plus(calculated.proficiency)],
      ['Classe de Armadura', `${calculated.armorClass} · ${calculated.armorSource}`],
      ['PV máximos', calculated.maximumHP],
      ['Dados de Vida', calculated.hitDice.join(' + ')],
      ['Iniciativa', plus(calculated.initiative)],
      ['Percepção passiva', calculated.passivePerception],
      ['Deslocamento', `${calculated.speed} pés`],
      ['Resistências a dano', calculated.resistances.map(damageTypeLabel).join(', ') || '—'],
      ...(calculated.damageImmunities.length
        ? [['Imunidades a dano', calculated.damageImmunities.map(damageTypeLabel).join(', ')]]
        : []),
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`)
      .join('')}</dl>
    <section><h3>Testes de resistência</h3><dl class="facts">${calculated.savingThrows
      .map(
        ({ id, name, bonus, proficient }) =>
          `<div><dt>${name}${proficient ? ' · proficiente' : ''}</dt><dd>${playable
            ? `<button class="text-button" type="button" data-play="save" data-check="${id}" aria-label="Rolar resistência de ${name}">${plus(bonus)}</button>`
            : plus(bonus)}</dd></div>`
      )
      .join('')}</dl></section></section>
    ${skillPanel(calculated.skills, playable)}</div>`)}
    ${panel('habilidades', `<div class="session-reference"><section>${facts()}</section><div>
    ${benefits()}
    ${projection.feats.length ? `<section class="benefits"><h3>Talentos</h3>${projection.feats.map((entry) => details(entry)).join('')}</section>` : ''}
    ${projection.selectedFeatures.length ? `<section class="benefits"><h3>Opções aprendidas e benefícios das escolhas</h3>${projection.selectedFeatures.map((entry) => details(entry)).join('')}</section>` : ''}
    ${choices.length
      ? `<details class="entry"><summary><strong>Escolhas registradas</strong></summary><ul class="pending">
      ${choices.map((group) => `<li>${escape(group.name)} · ${escape(group.selected.map((id) => displayName(group.options.find((option) => option.id === id))).join(', '))}</li>`).join('')}
      </ul></details>`
      : ''}</div></div>`)}
    ${panel('magias', `<div class="session-magic">${castingSummary(calculated)}
    ${
      projection.spells.length
        ? `<section class="benefits"><h3>Magias</h3>${[
            ['cantrip', 'Truques'],
            ['prepared', 'Preparadas'],
            ['always', 'Sempre preparadas e concedidas'],
            ['spellbook', 'Grimório'],
          ]
            .map(([mode, title]) => {
              const spells = projection.spells.map((spell, index) => ({ spell, index })).filter(
                ({ spell }) =>
                  (spell.preparation ?? (spell.level === 0 ? 'cantrip' : 'always')) === mode
              );
              return spells.length
                ? `<h4>${title}</h4><div class="session-inventory">${spells.map(({ spell, index }) => {
                    const ready = withSpellAbility(spell, calculated);
                    return spellCard(ready, playable ? spellPlayActions(ready, index, resources) : '');
                  }).join('')}</div>`
                : '';
            })
            .join('')}</section>`
        : '<p class="muted">Nenhuma magia registrada.</p>'
    }</div>`)}
    ${panel('inventario', `<section><h3>Inventário</h3><div class="session-inventory">${inventoryView(false, playable)}</div></section>`)}
    ${panel('historia', `<div class="session-reference"><div class="session-story">
    ${Object.entries(draft.narrative ?? {})
      .filter(([, text]) => text)
      .map(
        ([key, text]) =>
          `<section><h3>${narrativeLabels[key] ?? escape(key)}</h3><p class="description">${escape(text)}</p></section>`
      )
      .join('')}</div><div>
    ${publicSheet ? `<p class="description">${escape(draft.notes)}</p>` : `<label for="notes">Anotações</label><textarea id="notes" name="notes" rows="4" maxlength="10000">${escape(draft.notes)}</textarea>`}
    ${
      !publicSheet && user
        ? `<section><h3>Compartilhamento</h3>
      <p>${draft.cloudPublic ? `<a href="#publica/${draft.id}" target="_blank" rel="noopener">Abrir link público</a>` : 'Acesso restrito à sua conta'}</p>
      <button type="button" class="button secondary" data-publish>${draft.cloudPublic ? 'Tornar privada' : 'Publicar ficha'}</button>
    </section>`
        : ''
    }
    ${!publicSheet && characterSync?.conflicts.has(draft.id) ? '<p>Esta edição conflita com outra versão da conta.</p><button type="button" class="button secondary" data-copy-conflict>Salvar esta edição como nova ficha</button><button type="button" class="button secondary" data-reload-character>Usar versão da conta</button>' : ''}</div></div>`) }`;
}

function sessionSheet() {
  projection = projectCharacter(draft, catalog);
  return `<header class="session-header">
    <div><h1 class="icon-label">${characterEmblem(projection.classes)}${escape(title(draft))}</h1><p class="muted">${escape(classLevels(projection.classes))}</p></div>
    <div class="hub-actions"><a class="button secondary" href="#personagens">Meus personagens</a>
      <a class="button secondary" href="${link('origem')}">Editar ficha</a></div>
  </header>
  <nav class="session-tabs" aria-label="Seções da ficha">
    ${sheetTabs.map(([id, label]) => `<button class="button secondary" type="button"
      data-sheet-tab="${id}" aria-pressed="${id === sheetTab}">${label}</button>`).join('')}
  </nav>
  <form class="session-body" id="builder-form">${sheet()}</form>`;
}

function builder() {
  projection = projectCharacter(draft, catalog);
  const contents = {
    origem: origin,
    atributos: attributes,
    progressao: progression,
    equipamento: equipment,
    historia: narrative,
    revisao: review,
  };
  const stepIndex = steps.findIndex(([id]) => id === step);
  const previous = steps[stepIndex - 1]?.[0];
  const next = steps[stepIndex + 1]?.[0];
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
      <p class="muted">Nível total ${classPlan(draft).length} · ${draft.saved ? 'Ficha salva' : 'Rascunho'}</p>
      ${draft.saved ? `<a class="button secondary" href="${sheetLink(draft.id)}" target="_blank" rel="noopener">Abrir ficha de jogo</a>` : ''}</header>
    <div class="layout">
      <nav class="panel steps" aria-label="Etapas do personagem">${steps
        .map(
          ([id, label], index) =>
            `<a href="${link(id)}" ${id === step ? 'aria-current="step"' : ''}><span>${index + 1}</span> ${label}</a>`
        )
        .join('')}</nav>
      <form class="panel workspace" id="builder-form">
        <div class="builder-controls">
          ${previous ? `<a class="button secondary" href="${link(previous)}">Voltar</a>` : ''}
          ${next
          ? `<a class="button primary continue" href="${link(next)}">Continuar</a>`
          : `<button type="submit" class="button primary" ${missingChoices().length ? 'disabled' : ''}>Salvar ficha</button>`}</div>
        <div class="builder-fields" tabindex="0" aria-label="Escolhas da etapa">${contents[step]()}</div>
      </form>
      <aside class="panel summary"><h2>Resumo</h2>
        <dl class="facts">${summary.map(([name, value]) => `<div><dt>${name}</dt><dd>${value ? escape(value) : '—'}</dd></div>`).join('')}</dl>
        <p class="muted">${missingChoices().length} escolhas pendentes</p>
      </aside>
    </div>`;
}

function renderBuilder() {
  const fields = main.querySelector('.builder-fields');
  const scroll = fields?.scrollTop ?? 0;
  const open = [...(fields?.querySelectorAll('details') ?? [])].map((element) => element.open);
  main.innerHTML = builder();
  const next = main.querySelector('.builder-fields');
  next.querySelectorAll('details').forEach((element, index) => {
    element.open = open[index] ?? false;
  });
  next.scrollTop = scroll;
}

function setUser(nextUser) {
  if (user?.id !== nextUser?.id) {
    characterSync?.stop();
    characterSync = undefined;
    memory.clear();
    draft = undefined;
  }
  user = nextUser;
}

function menu() {
  profileName.textContent = user?.username ?? (guest ? 'Modo local' : 'Conta');
  profileName.title = profileName.textContent;
  headerMenu.querySelector('summary .profile-icon').outerHTML = avatarMarkup(user?.avatar);
  headerMenu.querySelector('summary').setAttribute('aria-label', 'Menu da conta · ' + profileName.textContent);
  accountMenu.innerHTML = user
    ? `${accountLink('#configuracoes', 'Configurações da conta', gameIcon('artificer'))}
      <button type="button" class="navigation-row account-action" data-logout><span class="game-emblem account-action-icon" aria-hidden="true">↪</span><span>Sair</span><span aria-hidden="true">›</span></button>`
    : guest
      ? accountLink('#configuracoes', 'Configurações', gameIcon('artificer')) + accountLink('#login', 'Entrar', '→')
      : accountLink('#login', 'Entrar', '→');
}

function accountSettings() {
  return `<section class="panel account-settings"><h1>Configurações</h1>
    ${user ? `<form class="account-settings-form" data-account-update="profile">
      <h2>Perfil</h2>
      <p>E-mail <strong>${escape(user.email)}</strong></p>
      <label for="profile-username">Nome de usuário</label>
      <input id="profile-username" name="username" autocomplete="username" value="${escape(user.username)}" minlength="3" maxlength="32" required>
      <div class="account-avatar-upload">
        <div class="account-avatar">${avatarMarkup(user.avatar)}</div>
        <label class="avatar-dropzone" for="profile-avatar">
          <input id="profile-avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Escolher foto de perfil" aria-describedby="profile-avatar-hint">
          <strong>Arraste uma foto ou clique para escolher</strong>
          <small id="profile-avatar-hint">JPG, PNG ou WebP de até 10 MB. Visível nas suas fichas públicas.</small>
        </label>
      </div>
      <label class="account-avatar-remove" ${user.avatar ? '' : 'hidden'}><input type="checkbox" name="removeAvatar"> Remover foto atual</label>
      <p role="alert"></p>
      <button class="button primary" type="submit">Salvar perfil</button>
    </form>
    <form class="account-settings-form" data-account-update="password">
      <h2>Alterar senha</h2>
      <label for="current-password">Senha atual</label>
      <input id="current-password" name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required>
      <label for="new-password">Nova senha</label>
      <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" aria-describedby="new-password-hint" required>
      <small id="new-password-hint">Use pelo menos 12 caracteres. A troca encerra as outras sessões da conta.</small>
      <label for="confirm-new-password">Confirme a nova senha</label>
      <input id="confirm-new-password" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
      <p role="alert"></p>
      <button class="button primary" type="submit">Salvar senha</button>
    </form>` : ''}
    <label for="account-theme">Aparência</label>
    <select id="account-theme">
      <option value="" ${!chosenTheme ? 'selected' : ''}>Usar tema do sistema</option>
      <option value="light" ${chosenTheme === 'light' ? 'selected' : ''}>Claro</option>
      <option value="dark" ${chosenTheme === 'dark' ? 'selected' : ''}>Escuro</option>
    </select>
  </section>`;
}

async function prepareAvatar(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('Escolha uma foto JPG, PNG ou WebP de até 10 MB.');
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível abrir a foto. Escolha outro arquivo.');
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const size = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 128, 128);
    context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 128, 128);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}

const avatarPreviews = new WeakMap();

async function previewAvatar(input) {
  const form = input.form;
  const file = input.files[0];
  const message = form.querySelector('[role="alert"]');
  const preview = form.querySelector('.account-avatar');
  const remove = form.elements.removeAvatar;
  message.textContent = '';
  avatarPreviews.delete(input);
  preview.innerHTML = avatarMarkup(remove.checked ? null : user?.avatar);
  if (!file) return;
  const pending = prepareAvatar(file);
  avatarPreviews.set(input, pending);
  try {
    const avatar = await pending;
    if (avatarPreviews.get(input) !== pending) return;
    remove.checked = false;
    preview.innerHTML = avatarMarkup(avatar);
  } catch (error) {
    if (avatarPreviews.get(input) !== pending) return;
    input.value = '';
    message.textContent = error.message;
  }
}

main.addEventListener('dragover', (event) => {
  const zone = event.target.closest('.avatar-dropzone');
  if (!zone || !event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  zone.classList.add('is-dragging');
});
main.addEventListener('dragleave', (event) => {
  const zone = event.target.closest('.avatar-dropzone');
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('is-dragging');
});
main.addEventListener('drop', (event) => {
  const zone = event.target.closest('.avatar-dropzone');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('is-dragging');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const input = zone.querySelector('input');
  const files = new DataTransfer();
  files.items.add(file);
  input.files = files.files;
  void previewAvatar(input);
});
main.addEventListener('change', ({ target }) => {
  if (target.id === 'profile-avatar') void previewAvatar(target);
  if (target.matches('.account-avatar-remove input')) {
    const input = target.form.elements.avatar;
    if (target.checked) input.value = '';
    void previewAvatar(input);
  }
});

async function submitAccountUpdate(form) {
  if (accountBusy || !user) return;
  const action = form.dataset.accountUpdate;
  const fields = new FormData(form);
  const message = form.querySelector('[role="alert"]');
  const username = fields.get('username')?.trim();
  const password = fields.get('password');
  if (action === 'profile' && username.length < 3) {
    message.textContent = 'Use pelo menos três caracteres no nome de usuário.';
    return;
  }
  if (action === 'password' && password !== fields.get('confirmation')) {
    message.textContent = 'A confirmação precisa ser igual à nova senha.';
    return;
  }
  const body = action === 'profile' ? { username } : { currentPassword: fields.get('currentPassword'), password };
  const submit = form.querySelector('button[type="submit"]');
  accountBusy = true;
  submit.disabled = true;
  message.textContent = '';
  const send = () => withSessionLock(() => authRequest(action, body));
  try {
    if (action === 'profile') {
      const file = fields.get('avatar');
      if (file.size) body.avatar = await (avatarPreviews.get(form.elements.avatar) ?? prepareAvatar(file));
      else if (fields.has('removeAvatar')) body.avatar = null;
    }
    const result = await send().catch(async (error) => {
      if (error.status !== 401) throw error;
      const restored = await restoreSession();
      if (restored?.id !== user?.id) throw new Error('Sua sessão expirou. Entre novamente.');
      return await send();
    });
    ++accountSync;
    setUser(result.user);
    if (action === 'password') form.reset();
    else {
      form.elements.username.value = result.user.username;
      form.elements.avatar.value = '';
      avatarPreviews.delete(form.elements.avatar);
      form.elements.removeAvatar.checked = false;
      form.querySelector('.account-avatar-remove').hidden = !result.user.avatar;
      form.querySelector('.account-avatar').innerHTML = avatarMarkup(result.user.avatar);
      gallery = undefined;
      publicRecord = undefined;
    }
    menu();
    accounts?.postMessage('changed');
    showNotice(action === 'profile' ? 'Perfil atualizado.' : 'Senha atualizada.');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    accountBusy = false;
    submit.disabled = false;
  }
}

function openHash(hash) {
  history.replaceState(null, '', '/' + hash);
  route();
  main.focus();
}

async function loadCatalog() {
  catalogError = false;
  try {
    const [response, localization, reference] = await Promise.all([
      fetch('/catalog.json'),
      fetch('/pt-BR.json')
        .then((result) => (result.ok ? result.json() : undefined))
        .catch(() => undefined),
      fetch('/reference.json').then((result) => (result.ok ? result.json() : undefined)),
    ]);
    if (!response.ok) throw new Error('Catálogo indisponível');
    catalog = indexCatalog(await response.json(), localization, reference);
  } catch {
    catalogError = true;
  } finally {
    catalogRequest = undefined;
    route();
  }
}

function route() {
  if (!initialized) return;
  main.classList.remove('session-screen', 'builder-screen');
  if (choiceDialog.open) choiceDialog.close();
  menu();
  const [page, id, section] = location.hash.slice(1).split('/');
  if (!['personagem', 'ficha'].includes(page)) viewedCharacter = undefined;
  if (page !== 'galeria') gallery = undefined;
  publicSheet = page === 'publica';
  const accountPage =
    location.pathname === '/reset-password'
      ? 'redefinir'
      : ['login', 'cadastro', 'recuperar'].includes(page)
        ? page
        : null;
  if (accountPage) {
    draft = undefined;
    main.innerHTML = accountView(accountPage);
    return;
  }
  if (!user && !guest && !publicSheet && !['compendio', 'galeria', 'busca'].includes(page)) {
    if (['personagem', 'ficha', 'novo', 'compendio', 'personagens'].includes(page)) returnTo = location.hash;
    openHash('#login');
    return;
  }
  if (page === 'configuracoes') {
    draft = undefined;
    main.innerHTML = hubShell(page, accountSettings());
    return;
  }
  if (!catalog) {
    main.innerHTML = catalogError
      ? '<section class="panel"><h1>Catálogo indisponível</h1><p>Tente carregar o catálogo novamente.</p><button type="button" class="button secondary" data-retry-catalog>Tentar novamente</button></section>'
      : '<p>Carregando o catálogo…</p>';
    if (!catalogError && !catalogRequest) catalogRequest = loadCatalog();
    return;
  }
  if (publicSheet && slug(id)) {
    if (publicRecord?.id !== id) {
      publicRecord = { id, loading: true };
      main.innerHTML = '<p>Carregando ficha compartilhada…</p>';
      characterRequest('/public/' + id)
        .then((document) => {
          if (publicRecord?.id !== id) return;
          publicRecord = document;
          if (location.hash === '#publica/' + id) route();
        })
        .catch((error) => {
          publicRecord = { id, error: error.message };
          if (location.hash === '#publica/' + id) route();
        });
    } else if (publicRecord.error) main.innerHTML = `<p>${escape(publicRecord.error)}</p>`;
    else if (!publicRecord.loading) {
      draft = publicRecord.draft;
      projection = projectCharacter(draft, catalog);
      main.innerHTML = `<a class="back" href="#galeria">Voltar à galeria pública</a>
        <article class="panel"><h1>${escape(title(draft))}</h1>${publicAuthor(publicRecord)}${sheet()}</article>`;
    }
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
  if (['personagem', 'ficha'].includes(page) && slug(id)) {
    draft = read(id) ?? (draft?.id === id && viewedCharacter === accessKey(id) ? draft : undefined);
    if (!draft) {
      main.innerHTML =
        '<section class="panel"><h1>Ficha não encontrada</h1><p>Ela pode estar salva em outro navegador.</p><a href="#inicio">Voltar aos personagens</a></section>';
      return;
    }
    if (viewedCharacter !== accessKey(id)) progressionLevel = undefined;
    markOpened(id);
    if (draft.saved && (page === 'ficha' || section === 'ficha')) {
      if (page !== 'ficha') history.replaceState(null, '', sheetLink(id));
      if (sessionId !== id) sheetTab = 'combate';
      sessionId = id;
      step = 'ficha';
      main.classList.add('session-screen');
      main.innerHTML = sessionSheet();
      document.title = title(draft) + ' · Ficha de jogo';
      return;
    }
    if (page === 'ficha') history.replaceState(null, '', link('revisao'));
    step = page === 'ficha' ? 'revisao' : steps.some(([key]) => key === section) ? section : 'origem';
    main.classList.add('builder-screen');
    main.innerHTML = builder();
    document.title = title(draft) + ' · Grimório';
    return;
  }
  draft = undefined;
  document.title = 'Grimório · D&D 2024';
  if (page === 'galeria') {
    const pageNumber = /^\d{1,6}$/.test(id ?? '') ? Math.min(100000, Math.max(1, Number(id))) : 1;
    main.innerHTML = publicGallery(pageNumber);
  } else if (page === 'personagens') {
    main.innerHTML = hubShell(
      page,
      `<header class="section-heading"><h1>Personagens</h1>${createLink()}</header>
      <div class="character-search"><label for="character-search">Buscar personagem ou classe</label>
        <input type="search" id="character-search" value="${escape(characterFilter)}"></div>
      <div id="character-results">${characterList(savedCharacters())}</div>`
    );
  } else if (page === 'busca') {
    main.innerHTML = hubShell(page, globalSearch(id));
  } else if (page === 'compendio') {
    const category = compendiumTabs.some(([key]) => key === id) ? id : 'classes';
    if (catalogCategory !== category) {
      catalogFilter = '';
      catalogSource = '';
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
    const changed = user?.id !== nextUser?.id;
    setUser(nextUser);
    if (user && guest) setGuestMode(false);
    if (user && !characterSync) {
      characterSync = syncCharacters({
        owner: user.id,
        list: savedCharacters,
        read,
        cache: cacheCharacter,
        notify: showNotice,
      });
      try {
        await characterSync.load();
      } catch (error) {
        showNotice(error.message);
      }
      if (epoch !== accountSync) return;
    }
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
  if (view === 'redefinir' && !token) {
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
      await syncSession(false, false);
      accounts?.postMessage('changed');
      openHash(returnTo || '#inicio');
      returnTo = undefined;
    } else if (view === 'cadastro') {
      await authRequest('register', { email, username, password });
      openHash('#login');
      showNotice('Você já pode entrar com o e-mail e a senha informados.');
    } else if (view === 'recuperar') {
      await authRequest('password-reset/request', { email });
      form.reset();
      showNotice('Se a conta estiver elegível, enviaremos o link por e-mail.');
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
  const logout = target.closest('[data-logout]');
  if (!logout || accountBusy) return;
  accountBusy = true;
  logout.disabled = true;
  try {
    await characterSync?.flush();
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
    logout.disabled = false;
  }
});

function update(field) {
  if (publicSheet) return;
  const name = field.name;
  if (name === 'inventory') {
    if (!field.checkValidity()) {
      field.reportValidity();
      return;
    }
    const row = characterInventory(draft, projection, catalog).find(
      ({ id }) => id === field.dataset.itemKey
    );
    if (!row) return;
    const { item, base, name: label, source, ...stored } = row;
    stored[field.dataset.property] =
      field.type === 'checkbox'
        ? field.checked
        : field.dataset.property === 'quantity'
          ? Number(field.value)
          : field.value;
    draft.inventory = [...(draft.inventory ?? []).filter(({ id }) => id !== row.id), stored];
  } else if (name === 'narrative') {
    draft.narrative ??= {};
    draft.narrative[field.dataset.narrative] = field.value;
  } else if (field.dataset.feature) {
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
  if (step !== 'atributos' || !attributeIssue(draft)) draft.selected = projection.validSelections;
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
    showDice([{ ...roll, label, sides: 6, total: roll.score }]);
  } else if (button.id === 'roll-batch') {
    draft.abilityBatch = { rolls: abilities.map(() => rollAbilityScore()), assignments: {} };
    showDice(draft.abilityBatch.rolls.map((roll, index) => ({
      ...roll, label: `Rolagem ${index + 1}`, sides: 6, total: roll.score,
    })));
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
  renderBuilder();
  document.getElementById(focusId)?.focus({ preventScroll: true });
  if (result) document.getElementById('roll-results').textContent = result;
}

function renderPlay() {
  const hp = document.getElementById('play-hp')?.value;
  const skill = document.getElementById('combat-skill')?.value;
  const quickSpell = document.getElementById('combat-spell')?.value;
  const open = [...main.querySelectorAll('details')].map((element) => element.open);
  const activePane = '[data-sheet-pane]:not([hidden])';
  const scroll = main.querySelector(activePane)?.scrollTop ?? 0;
  const inventoryScroll = main.querySelector(`${activePane} > section`)?.scrollTop ?? 0;
  main.innerHTML = sessionSheet();
  if (hp) document.getElementById('play-hp').value = hp;
  if (skill) document.getElementById('combat-skill').value = skill;
  const spellSelect = document.getElementById('combat-spell');
  if (spellSelect && [...spellSelect.options].some(({ value }) => value === quickSpell)) {
    spellSelect.value = quickSpell;
    renderCombatSpell(Number(quickSpell));
  }
  main.querySelectorAll('details').forEach((element, index) => {
    element.open = open[index] ?? false;
  });
  const pane = main.querySelector(activePane);
  pane.scrollTop = scroll;
  const inventory = pane.querySelector(':scope > section');
  if (inventory) inventory.scrollTop = inventoryScroll;
}

function renderCombatSpell(index) {
  const calculated = deriveCharacter(draft, projection, catalog);
  const spell = withSpellAbility(projection.spells[index], calculated);
  document.getElementById('combat-spell-actions').innerHTML = spellPlayActions(spell, index, playResources(draft, calculated));
}

function savePlay(play) {
  draft.play = play;
  draft.updatedAt = Date.now();
  if (!write()) showNotice('Armazenamento indisponível. As alterações ficam nesta aba.');
  renderPlay();
}

function playAction(button) {
  if (step !== 'ficha' || !draft?.saved || publicSheet) return;
  const { play: action, sides } = button.dataset;
  const check = button.hasAttribute('data-combat-skill') ? document.getElementById('combat-skill').value : button.dataset.check;
  const calculated = deriveCharacter(draft, projection, catalog);
  const resources = playResources(draft, calculated);
  const play = draft.play ?? {};
  if (['damage', 'heal', 'temporary'].includes(action)) {
    const input = document.getElementById('play-hp');
    if (input.value === '' || !input.reportValidity()) return;
    savePlay(updatePlayHP(play, calculated.maximumHP, action, input.valueAsNumber));
    return;
  }
  if (action === 'long' || action === 'short') {
    if (!resources.currentHP && (action === 'long' || !resources.shortRest)) return;
    if (action === 'short' && !resources.shortRest) {
      savePlay({ ...play, shortRest: true });
      showNotice('Gaste Dados de Vida para se curar e conclua o descanso curto.');
    } else {
      savePlay(completeRest(play, action));
      showNotice(action === 'long' ? 'Descanso longo concluído.' : 'Descanso curto concluído.');
    }
    return;
  }
  if (action === 'hit-die') {
    if (!resources.shortRest || !resources.hitDice.some(({ key, remaining }) => key === sides && remaining)) return;
    const roll = rollDice(1, Number(sides), calculated.modifiers.con);
    const healing = Math.max(1, roll.total);
    savePlay(updatePlayHP({
      ...play, hitDice: { ...play.hitDice, [sides]: (play.hitDice?.[sides] ?? 0) + 1 },
    }, calculated.maximumHP, 'heal', healing));
    showDice([{ ...roll, label: 'Dado de Vida' }]);
    showNotice(`Recuperou ${Math.min(healing, calculated.maximumHP - resources.currentHP)} PV.`);
    return;
  }
  if (action === 'ability') {
    const ability = abilities.find(([id]) => id === check);
    if (ability) showDice([{ ...rollCheck(calculated.modifiers[check], calculated.armorUntrained && ['str', 'dex'].includes(check)), label: ability[2] }]);
    return;
  }
  if (['initiative', 'save', 'skill'].includes(action)) {
    const selected = action === 'initiative'
      ? { name: 'Iniciativa', bonus: calculated.initiative, disadvantage: calculated.armorUntrained }
      : (action === 'save' ? calculated.savingThrows : calculated.skills).find(({ id }) => id === check);
    if (selected) showDice([{ ...rollCheck(selected.bonus, selected.disadvantage), label: selected.name }]);
    return;
  }
  if (action === 'weapon-attack' || action === 'weapon-damage') {
    const weapon = equippedWeaponRolls(projection, calculated).find(({ id }) => id === button.dataset.weapon);
    if (!weapon) return;
    const { name, attack, damage, type, disadvantage } = weapon;
    showDice([action === 'weapon-attack'
      ? { ...rollCheck(attack, disadvantage), label: `${name} · Ataque` }
      : { ...rollDice(damage.count, damage.sides, damage.bonus), label: `${name} · ${damageTypeLabel(type)}` }]);
    return;
  }
  const controls = button.closest('[data-spell-index]');
  const index = Number(controls?.dataset.spellIndex);
  const entry = projection.spells[index];
  if (!entry) return;
  const spell = withSpellAbility(entry, calculated);
  let level = lastCast?.character === draft.id && lastCast.index === index && lastCast.spellId === spell.id
    ? lastCast.level
    : spell.level;
  if (action === 'cast') {
    const key = controls.querySelector('select')?.value;
    const option = spellCastingOptions(spell, resources, play).find((item) => item.key === key);
    if (!option) return;
    level = option.level;
    lastCast = { character: draft.id, index, spellId: spell.id, level };
    const slot = resources.slots.some((item) => item.key === key);
    if (slot || /^(short|long):/.test(key)) {
      const field = slot ? 'slots' : 'free';
      savePlay({ ...play, [field]: { ...play[field], [key]: (play[field]?.[key] ?? 0) + 1 } });
    } else {
      renderPlay();
    }
  }
  const rolls = spellRolls(spell, classPlan(draft).length, level);
  const roll = rolls[action === 'cast' ? 0 : Number(button.dataset.rollIndex)];
  if (roll) {
    const label = `${spellName(spell)} · ${roll.label}${roll.type ? ' · ' + roll.type : ''}`;
    showDice(Array.from({ length: roll.repeat ?? 1 }, (_, i) => ({
      ...rollDice(roll.count, roll.sides, roll.bonus),
      label: roll.repeat > 1 ? `${label} ${i + 1}` : label,
    })));
  } else if (action === 'cast') showNotice(`${spellName(spell)} conjurada.`);
}

function pickerGroup(key = picker?.key) {
  if (key === 'inventory-add')
    return {
      name: 'Adicionar ao inventário',
      count: 1,
      selected: [],
      inventoryAdd: true,
      options: sortEntries(catalog.items),
    };
  if (key?.startsWith('inventory-base/')) {
    const id = key.slice('inventory-base/'.length);
    const row = characterInventory(draft, projection, catalog).find((item) => item.id === id);
    if (!row) return;
    return {
      name: 'Tipo de item base',
      count: 1,
      selected: row.baseItemId ? [row.baseItemId] : [],
      inventoryBase: id,
      options: catalog.items.filter(
        (item) =>
          row.item.baseItems?.includes(item.name) ||
          (!row.item.baseItems &&
            item.kind === row.item.kind &&
            !item.magic &&
            item.id !== 'shield')
      ),
    };
  }
  if (key === 'warlock-invocations') {
    return {
      name: 'Invocações Místicas',
      readOnly: true,
      options: sortEntries(catalog.warlockInvocationList),
      selected: [],
    };
  }
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
  return availableSpellChoices(projection.groups.find((group) => group.key === key), projection.spells);
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
        `<li>${articleLink('magias', spell, level > 1 ? `A partir do nível ${level}` : '')}</li>`
      );
    }),
    ...(featsFixed ?? []).map(({ id, note }) => {
      const feat = catalog.byFeat.get(id);
      return (
        feat &&
        `<li>${articleLink('feats', feat, note ? classLabel(note) : '')}</li>`
      );
    }),
  ].filter(Boolean);
  if (!fixed.length && !picks.length && !links.length) return '';
  return `<section class="wiki-benefits"><h3>Benefícios e escolhas</h3><ul>
    ${fixed.map(([label, values]) => `<li><strong>${label}</strong> · ${escape(values.join(', '))}</li>`).join('')}
    ${picks.map((value) => `<li>${escape(value)}</li>`).join('')}
    </ul>${links.length ? `<ul class="wiki-class-links">${links.join('')}</ul>` : ''}</section>`;
}

function optionDetails(option, wiki = false, characterArticle = false) {
  const style = option.collection === 'fighting-styles' && catalog.byFeat.get(option.id);
  const grantedFeat = option.feat && typeof option.feat === 'object' ? option.feat : undefined;
  const entry = grantedFeat ?? (style || option);
  const description = grantedFeat
    ? entryDescription(option, true, wiki) + entryDescription(entry, true, wiki)
    : entryDescription(entry, true, wiki);
  const features = [...(entry.traits ?? []), ...(entry.features ?? [])].sort(
    (a, b) => (a.level ?? 0) - (b.level ?? 0)
  );
  const choices = (entry.choices ?? []).filter((choice) => choice.options?.length);
  const backgroundFeats = entry.collection === 'backgrounds'
    ? (entry.featsFixed ?? []).map(({ id, note }) => ({ feat: catalog.byFeat.get(id), note }))
        .filter(({ feat }) => feat)
    : [];
  const backgroundFeatChoices = entry.collection === 'backgrounds'
    ? (entry.featChoices ?? []).map((rule) => ({
        count: rule.pick,
        options: sortEntries(catalog.feats.filter(({ id, category }) =>
          category === rule.category || rule.include?.includes(id)
        )),
      }))
    : [];
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
    ['Tipo de criatura', creatureTypeName(entry.creatureType)],
    ['Nível de desafio', entry.cr],
    [
      'Tamanho',
      entry.size?.map((size) => ({ Medium: 'Médio', Small: 'Pequeno' })[size] ?? size).join(' / '),
    ],
    ['Atributos do antecedente', entry.abilityScores?.map(abilityLabel).join(', ')],
    ['Perícias', !wiki && entry.skillsFixed?.map(skillName).join(', ')],
    ['Ferramenta', entry.tool && (catalog.toolNames.get(entry.tool) ?? entry.tool)],
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
    ['Uso da ferramenta', entry.translation?.utilize ?? entry.utilize],
    ['Dano', entry.translation?.damage ?? entry.damage],
    ['Classe de Armadura', entry.translation?.ac ?? entry.ac],
    ['Força mínima da armadura', entry.strength],
    ['Furtividade', entry.stealth === 'Disadvantage' ? 'Desvantagem' : entry.stealth],
    ['Preço', entry.cost != null && `${entry.cost / 100} PO`],
    ['Peso', entry.weight != null && `${entry.weight} lb`],
    [
      'Raridade',
      {
        common: 'Comum',
        uncommon: 'Incomum',
        rare: 'Raro',
        'very rare': 'Muito raro',
        legendary: 'Lendário',
        artifact: 'Artefato',
        varies: 'Variável',
      }[entry.rarity] ?? entry.rarity,
    ],
    ['Sintonia', entry.translation?.attunement ?? entry.attunement],
    ['Propriedades', entry.translation?.properties ?? entry.properties],
    ['Pré-requisito', prerequisiteText(option, catalog) ?? prerequisiteText(entry, catalog)],
    ['Talento repetível', wiki && entry.repeatable && 'Sim'],
    ...(entry.grants ?? []).map((grant) => grantDetails(grant, catalog)),
  ].filter(([, value]) => value);
  const spell = option.spell && catalog.bySpell.get(option.spell);
  const fixedSpells = (entry.spellsFixed ?? [])
    .map(({ id, level }) => {
      const fixed = catalog.bySpell.get(id);
      return fixed ? `${spellName(fixed)} (nível ${level ?? 1})` : '';
    })
    .filter(Boolean);
  const facts = rows.length ? `<dl class="spell-facts">${rows.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : '';
  const overview = characterArticle && (description || facts)
    ? `<div class="wiki-character-overview">${description ? `<div class="wiki-character-intro">${description}</div>` : ''}
      ${facts ? `<aside class="wiki-character-facts" aria-label="Dados principais">${facts}</aside>` : ''}</div>`
    : facts + description;
  return `${overview}
    ${backgroundFeats.length ? `<section class="benefits"><h4>Talentos do antecedente</h4>
      ${backgroundFeats.map(({ feat, note }) => `<details class="entry background-feat">
        <summary><strong class="icon-label">${catalogEmblem('feats', feat)}${escape(displayName(feat))}${note ? ` · ${escape(classLabel(note))}` : ''}</strong></summary>
        ${entryDescription(feat, true, wiki)}</details>`).join('')}
    </section>` : ''}
    ${backgroundFeatChoices.map(({ count, options }) => `<section class="benefits">
      <h4>Talentos à escolha (${escape(count)})</h4>
      ${options.map((feat) => details(feat, wiki, true)).join('')}
    </section>`).join('')}
    ${referenceDetails(entry, wiki)}
    ${wiki ? wikiBenefits(entry) : fixedSpells.length ? `<p><strong>Magias concedidas.</strong> ${escape(fixedSpells.join(' · '))}</p>` : ''}
    ${features.length ? `<section class="benefits"><${wiki ? 'h3' : 'h4'}>Características e habilidades</${wiki ? 'h3' : 'h4'}>${features.map((feature) => details(feature, wiki)).join('')}</section>` : ''}
    ${entry.sections?.length ? `<section class="benefits"><${wiki ? 'h3' : 'h4'}>Referências</${wiki ? 'h3' : 'h4'}>${entry.sections.map((section) => details(section, wiki)).join('')}</section>` : ''}
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
  const tags = group.readOnly ? (entry) => [entry.prereq?.text ?? 'Bruxo nível 1+'] : optionLabels;
  const emblem = (entry) => group.spellPicker ? spellIcon(entry)
    : entry.emblem ? gameIcon(entry.emblem, 'game-emblem') : catalogEmblem(entry.collection, entry);
  const tagMarkup = (entry) => group.spellPicker
    ? spellTagMarkup(entry)
    : tags(entry).map((tag) => `<span class="tag">${escape(tag)}</span>`).join('');
  const matches = group.spellPicker
    ? filterSpells(group.options.map(({ id }) => catalog.bySpell.get(id)).filter(Boolean), {
        search,
        level: choiceDialog.querySelector('#spell-level').value,
        school: choiceDialog.querySelector('#spell-school').value,
        publication: choiceDialog.querySelector('#spell-publication').value,
        damage: choiceDialog.querySelector('#spell-damage').value,
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
          const selected = group.selected.includes(entry.id);
          const metadata = group.spellPicker ? [] : tags(entry);
          return `<button class="picker-row" type="button"
    data-preview-option="${escape(entry.id)}" data-selected="${selected}" aria-pressed="${entry.id === active?.id}">
    <span class="picker-row-title"><strong class="icon-label">${emblem(entry)}${escape(name(entry))}</strong>
    ${selected ? `<span class="picker-selected"><span aria-hidden="true">✓</span> ${group.spellPicker ? 'Selecionada' : 'Em uso'}</span>` : ''}</span>
    ${
      group.spellPicker
        ? `<span class="picker-tags">${tagMarkup(entry)}</span>`
        : metadata.length
          ? `<small>${escape(metadata.join(' · '))}</small>`
          : ''
    }</button>`;
        })
        .join('')
    : '<p class="muted">Nenhuma opção corresponde à busca.</p>';
  list.scrollTop = scroll;
  choiceDialog.querySelector('.picker-count').textContent = group.readOnly
    ? `${matches.length} de ${group.options.length} invocações`
    : group.optional
      ? `${group.selected.length} selecionadas · opcional`
      : `${group.selected.length} de ${group.count} selecionadas`;
  const selected = active && group.selected.includes(active.id);
  choiceDialog.querySelector('.picker-detail').innerHTML = active
    ? `
    <div class="picker-detail-header"><div><h3 class="icon-label">${emblem(active)}${escape(name(active))}</h3>
      <div class="picker-tags">${tagMarkup(active)}</div></div>
      ${
        group.readOnly
          ? ''
          : `<button type="button" class="button ${selected ? 'secondary' : 'primary'}" data-toggle-option="${escape(active.id)}"
        ${(selected && group.index !== undefined) || (!selected && group.count > 1 && group.selected.length >= group.count) ? 'disabled' : ''}>
        ${selected ? (group.index === undefined ? 'Remover' : 'Selecionada') : group.count === 1 && group.selected.length ? 'Trocar' : 'Selecionar'}${group.spellPicker ? ' magia' : ''}</button>`
      }
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
      <div><label for="picker-search">${group.readOnly ? 'Buscar invocação' : group.spellPicker ? 'Buscar magia' : 'Buscar opção'}</label><input type="search" id="picker-search" autofocus></div>
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
  if (!action || !group || group.readOnly) return;
  const id = action.dataset.toggleOption;
  if (!group.options.some((option) => option.id === id)) return;
  if (group.inventoryAdd || group.inventoryBase) {
    if (group.inventoryAdd) {
      draft.inventory = [
        ...(draft.inventory ?? []),
        { id: crypto.randomUUID(), itemId: id, quantity: 1 },
      ];
    } else {
      const row = characterInventory(draft, projection, catalog).find(
        ({ id }) => id === group.inventoryBase
      );
      const { item, base, name, source, ...stored } = row;
      draft.inventory = [
        ...(draft.inventory ?? []).filter(({ id }) => id !== row.id),
        { ...stored, baseItemId: id, equipped: false },
      ];
    }
    persistChange();
    renderBuilder();
    choiceDialog.close();
    return;
  }
  if (group.index !== undefined) {
    draft.classPlan = [...classPlan(draft)];
    draft.classPlan[group.index] = id;
    progressionLevel = group.index + 1;
    persistChange();
    renderBuilder();
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
  renderBuilder();
  drawPicker();
  (
    choiceDialog.querySelector('[data-toggle-option]:enabled') ??
    choiceDialog.querySelector('[data-close-picker]')
  ).focus();
});

const deleteDialog = document.querySelector('#delete-character-dialog');
let deletionCandidate;
deleteDialog.addEventListener('close', async () => {
  const candidate = deletionCandidate;
  deletionCandidate = undefined;
  if (!candidate || deleteDialog.returnValue !== 'delete') return;
  const { character, button, sync, prefix } = candidate;
  if (storagePrefix() !== prefix || characterSync !== sync) return;
  button.disabled = true;
  try {
    if (sync) await sync.remove(character);
    else cacheCharacter(undefined, character.id);
    if (location.hash === '#personagens') route();
    showNotice('Ficha excluída.');
  } catch (error) {
    if (error.code === 'REVISION_CONFLICT' && sync === characterSync) {
      await sync.load().catch(() => {});
      if (location.hash === '#personagens') route();
      showNotice('A ficha mudou em outra aba. Confira a versão atual antes de excluir.');
    } else showNotice(error.message);
  } finally {
    button.disabled = false;
  }
});

choiceDialog.addEventListener('close', () => {
  const key = picker?.key;
  picker = undefined;
  document.getElementById(`picker:${key}`)?.focus();
});

main.addEventListener('click', async ({ target }) => {
  if (publicSheet) return;
  const tab = target.closest('[data-sheet-tab], [data-sheet-jump]');
  if (tab) {
    sheetTab = tab.dataset.sheetTab ?? tab.dataset.sheetJump;
    main.querySelectorAll('[data-sheet-tab]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.sheetTab === sheetTab));
    });
    main.querySelectorAll('[data-sheet-pane]').forEach((pane) => {
      pane.hidden = pane.dataset.sheetPane !== sheetTab;
    });
    if (tab.dataset.sheetJump) main.querySelector(`[data-sheet-tab="${sheetTab}"]`)?.focus();
    return;
  }
  const playButton = target.closest('button[data-play]');
  if (playButton) {
    playAction(playButton);
    return;
  }
  const equip = target.closest('[data-equip-item]');
  if (equip) {
    const inventory = characterInventory(draft, projection, catalog);
    const row = inventory.find(({ id }) => id === equip.dataset.equipItem);
    if (!row || !equipmentSlot(row)) return;
    const conflicts = row.equipped ? [] : equipmentConflicts(row, inventory);
    const changes = new Map((draft.inventory ?? []).map((item) => [item.id, item]));
    for (const entry of [row, ...conflicts]) {
      const { item, base, name, source, ...stored } = entry;
      changes.set(entry.id, { ...stored, equipped: entry === row && !row.equipped });
    }
    draft.inventory = [...changes.values()];
    if (conflicts.length) showNotice('Desequipado: ' + conflicts.map(({ name }) => name).join(', '));
    if (step === 'ficha') {
      draft.updatedAt = Date.now();
      if (!write()) showNotice('Armazenamento indisponível. As alterações ficam nesta aba.');
      renderPlay();
    } else {
      persistChange();
      renderBuilder();
    }
    main.querySelector(`[data-equip-item="${CSS.escape(row.id)}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.closest('[data-retry-gallery]')) {
    gallery = undefined;
    route();
    return;
  }
  const removedItem = target.closest('[data-remove-item]');
  if (removedItem) {
    const id = removedItem.dataset.removeItem;
    if (id.startsWith('starter/')) draft.removedEquipment = [...(draft.removedEquipment ?? []), id];
    draft.inventory = (draft.inventory ?? []).filter((row) => row.id !== id);
    persistChange();
    renderBuilder();
    return;
  }
  const deletion = target.closest('[data-delete-character]');
  if (deletion) {
    const character = read(deletion.dataset.deleteCharacter);
    if (!character || deleteDialog.open) return;
    deletionCandidate = { character, button: deletion, sync: characterSync, prefix: storagePrefix() };
    deleteDialog.returnValue = '';
    deleteDialog.querySelector('p').textContent = `A ficha “${title(character)}” será excluída.`;
    deleteDialog.showModal();
    return;
  }
  if (target.closest('[data-copy-conflict]')) {
    draft = {
      ...draft,
      id: crypto.randomUUID(),
      cloudVersion: 0,
      cloudPublic: false,
      cloudDirty: true,
    };
    write();
    openHash(sheetLink(draft.id));
    return;
  }
  if (target.closest('[data-reload-character]')) {
    if (!confirm('Substituir esta edição pela versão salva na conta?')) return;
    try {
      await characterSync.reload(draft.id);
      route();
    } catch (error) {
      showNotice(error.message);
    }
    return;
  }
  const publication = target.closest('[data-publish]');
  if (publication) {
    if (!draft.cloudPublic && (!draft.saved || missingChoices().length)) {
      showNotice('Complete a revisão e salve a ficha antes de publicar.');
      return;
    }
    const id = draft.id;
    const sync = characterSync;
    publication.disabled = true;
    try {
      await sync.setPublication(id, !draft.cloudPublic);
      publicRecord = undefined;
    } catch (error) {
      showNotice(error.message);
    } finally {
      if (sync === characterSync && id === draft?.id && !publicSheet && step === 'ficha') renderPlay();
    }
    return;
  }
  const levelHeading = target.closest('[data-open-level]');
  if (levelHeading) {
    progressionLevel = Number(levelHeading.dataset.openLevel);
    renderBuilder();
    main.querySelector(`[data-open-level="${progressionLevel}"]`)?.focus();
    return;
  }
  if (target.closest('[data-remove-level]')) {
    draft.classPlan = classPlan(draft).slice(0, -1);
    persistChange();
    renderBuilder();
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
  if (publicSheet) return;
  if (target.id === 'character-search') {
    characterFilter = target.value;
    document.querySelector('#character-results').innerHTML = characterList(savedCharacters());
    return;
  }
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
  if (target.id === 'catalog-source') {
    catalogSource = target.value;
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
  if (target.id === 'combat-spell') {
    renderCombatSpell(Number(target.value));
    return;
  }
  if (target.id === 'account-theme') {
    setTheme(target.value);
    return;
  }
  if (publicSheet) return;
  if (target.matches('[data-play-control]')) return;
  if (target.form?.id !== 'builder-form' || ['name', 'notes', 'feature-note'].includes(target.name))
    return;
  update(target);
  renderBuilder();
  document.getElementById(target.id)?.focus({ preventScroll: true });
});

document.querySelector('#quick-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = String(new FormData(event.currentTarget).get('query')).trim();
  if (!query) return;
  const hash = '#busca/' + encodeURIComponent(query);
  if (location.hash === hash) route();
  else location.hash = hash;
});

main.addEventListener('submit', (event) => {
  if (event.target.matches('form[data-account-update]')) {
    event.preventDefault();
    void submitAccountUpdate(event.target);
    return;
  }
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
  if (write())
    showNotice(user ? 'Ficha salva. Sincronizando com sua conta.' : 'Ficha salva neste navegador.');
  else showNotice('A ficha está disponível apenas nesta aba.');
  location.hash = sheetLink(draft.id);
});

window.addEventListener('hashchange', () => {
  if (deleteDialog.open) deleteDialog.close('cancel');
  clearTimeout(diceTimer);
  diceBoard.hidden = true;
  diceBoard.replaceChildren();
  if (dicePopup.open) dicePopup.close();
  route();
  main.focus({ preventScroll: true });
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
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !user || accountBusy) return;
  const owner = user.id;
  await syncSession(false, false);
  if (user?.id !== owner) {
    route();
    return;
  }
  if (/^#(?:personagem|ficha)\//.test(location.hash)) return;
  try {
    await characterSync?.load();
  } catch (error) {
    showNotice(error.message);
  }
  if (!/^#(?:personagem|ficha)\//.test(location.hash)) route();
});
window.addEventListener('online', () => {
  if (/^#(?:personagem|ficha)\//.test(location.hash)) {
    void characterSync?.flush();
    return;
  }
  void characterSync
    ?.load()
    .then(() => {
      if (!/^#(?:personagem|ficha)\//.test(location.hash)) route();
    })
    .catch((error) => showNotice(error.message));
});
