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
  characterInventory, completeRest, deriveCharacter, equippedWeaponRolls, equipmentConflicts, equipmentSlot, playResources, rollDice, skillAbilities, updatePlayHP,
} from './mechanics.js';
import { accountLink, accountView, authRequest, restoreSession, withSessionLock } from './auth.js';
import { adminView, mountAdmin } from './admin.js';
import { characterRequest, syncCharacters } from './characters.js';
import { classArticles, classProgression, compendiumHref, sortEntries } from './compendium.js';
import { installGlossary } from './glossary.js';
import {
  damageTypeLabel,
  damageEmblem,
  damageTag,
  escapeHtml as escape,
  filterSpells,
  formatRulesDescription,
  gameIcon,
  normalizeSearch,
  originalDescription,
  rulesDescriptionParts,
  rulesTable,
  schoolEmblem,
  spellCard,
  spellCircle,
  spellDamageTypes,
  spellDescription,
  spellIcon,
  spellSubtitle,
  spellName,
  spellRolls,
  spellSchools,
  spellTagMarkup,
  spellTheme,
} from './spells.js';

const main = document.querySelector('#main');
const choiceDialog = document.querySelector('#choice-picker');
const publicSpellDialog = document.querySelector('#public-spell-dialog');
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
  if (themeSelect) setChipValue(themeSelect, chosenTheme);
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
let diceAnimation;
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
let catalogFilters = {};
let catalogSpellFilters = {};
let catalogLimit = 24;
let characterSync;
let characterFilter = '';
let publicSheet = false;
let publicRecord;
let lastCast;
let publicationFeedback;
let gallery;
let gallerySearch = '';
let gallerySearchTimer;
const galleryFilters = {};
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
  classes.map(({ entry, levels, subclass }) =>
    `${displayName(entry)}${subclass ? ` · ${displayName(subclass)}` : ''} nível ${levels.length}`
  ).join(' · ');

const classEmblems = new Set('artificer barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard'.split(' '));
const classEmblemOverrides = {
  cleric: 'class-cross',
  druid: 'class-herbs',
  sorcerer: 'class-wand',
  wizard: 'class-wizard-hat',
  fighter: 'slashing',
};
const subclassEmblems = {
  alchemist: 'subclass-potion', armorer: 'shield', artillerist: 'force',
  'battle-smith': 'bludgeoning', cartographer: 'subclass-map', reanimator: 'necromancy',
  'path-of-the-berserker': 'barbarian', 'path-of-the-wild-heart': 'ability-heart',
  'path-of-the-world-tree': 'druid', 'path-of-the-zealot': 'subclass-sacred-flame',
  'college-of-dance': 'subclass-dance', 'college-of-glamour': 'enchantment', 'college-of-lore': 'ability-book',
  'college-of-spirits': 'necromancy', 'college-of-the-moon': 'subclass-moon', 'college-of-valor': 'slashing',
  'arcana-domain': 'wizard', 'grave-domain': 'necrotic', 'knowledge-domain': 'ability-book',
  'life-domain': 'ability-heart', 'light-domain': 'subclass-round-sun', 'trickery-domain': 'illusion', 'war-domain': 'weapon',
  'circle-of-the-land': 'druid', 'circle-of-the-moon': 'subclass-moon',
  'circle-of-the-sea': 'subclass-wave', 'circle-of-the-stars': 'subclass-stars',
  'arcane-archer': 'ranger', banneret: 'paladin', 'battle-master': 'fighter',
  champion: 'slashing', 'eldritch-knight': 'evocation', 'psi-warrior': 'psychic',
  'warrior-of-mercy': 'subclass-mercy-mask', 'warrior-of-shadow': 'subclass-moon',
  'warrior-of-the-elements': 'fire', 'warrior-of-the-mystic-arts': 'conjuration', 'warrior-of-the-open-hand': 'subclass-open-palm',
  'oath-of-devotion': 'class-cross', 'oath-of-glory': 'subclass-holy-reliquary', 'oath-of-the-ancients': 'druid',
  'oath-of-the-noble-genies': 'evocation', 'oath-of-vengeance': 'slashing',
  'beast-master': 'subclass-paw', 'fey-wanderer': 'subclass-fairy', 'gloom-stalker': 'subclass-third-eye',
  'hollow-warden': 'subclass-hollow', hunter: 'ranger', 'winter-walker': 'snowflake',
  'arcane-trickster': 'illusion', assassin: 'piercing', phantom: 'necromancy',
  'scion-of-the-three': 'necrotic', soulknife: 'psychic', thief: 'rogue',
  'aberrant-sorcery': 'psychic', 'clockwork-sorcery': 'artificer', 'draconic-sorcery': 'dragonborn',
  'shadow-sorcery': 'subclass-moon', 'spellfire-sorcery': 'fire', 'wild-magic-sorcery': 'evocation',
  'archfey-patron': 'enchantment', 'celestial-patron': 'aasimar', 'fiend-patron': 'tiefling',
  'great-old-one-patron': 'subclass-third-eye', 'undead-patron': 'necromancy', 'vestige-patron': 'warlock',
  abjurer: 'abjuration', bladesinger: 'slashing', conjurer: 'conjuration', diviner: schoolEmblem('Divination'),
  enchanter: 'enchantment', evoker: schoolEmblem('Evocation'), illusionist: 'illusion', necromancer: 'necromancy', transmuter: 'transmutation',
};
const categoryEmblems = {
  classes: 'paladin', subclasses: 'shield', species: 'species',
  backgrounds: 'origin-traveler', magias: 'class-wand',
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
const speciesEmblems = {
  aasimar: 'aasimar',
  boggart: 'species-boggart',
  centaur: 'species-centaur',
  changeling: 'species-changeling',
  dhampir: 'species-fangs',
  dragonborn: 'dragonborn',
  dwarf: 'dwarf',
  elf: 'elf',
  faerie: 'species-fairy-wings',
  flamekin: 'species-flamekin',
  gnome: 'species-gnome',
  goliath: 'goliath',
  halfling: 'halfling',
  hexblood: 'species-hexblood',
  human: 'human',
  kalashtar: 'species-kalashtar',
  khoravar: 'species-khoravar',
  'lorwyn-changeling': 'species-lorwyn-changeling',
  lupin: 'species-lupin',
  orc: 'orc',
  reborn: 'species-reborn',
  rimekin: 'species-rimekin',
  shifter: 'species-shifter',
  tiefling: 'tiefling',
  warforged: 'species-warforged',
};
const abilityEmblems = { str: 'monk', dex: 'ability-boot', con: 'ability-heart', int: 'ability-book', wis: 'divination', cha: 'ability-jester' };
const featEmblems = {
  Origin: 'feat-skilled', General: 'radiant', 'Fighting Style': 'weapon', 'Epic Boon': 'subclass-stars',
  'Dark Gift': 'warlock', Dragonmark: 'dragonborn', 'Planar Pact': 'conjuration',
};
const namedFeatEmblems = {
  alert: 'feat-alert', lucky: 'feat-lucky', healer: 'feat-healer', crafter: 'feat-crafter',
  musician: 'feat-musician', 'tavern-brawler': 'feat-tavern', 'magic-initiate': 'feat-magic',
  skilled: 'feat-skilled', tough: 'feat-tough', 'savage-attacker': 'feat-attacker',

  'sharp-eye': 'feat-sharp-eye',
  'arcane-artist': 'feat-arcane-artist',
  'arcane-eloquence': 'feat-arcane-eloquence',
  'arcane-infiltrator': 'feat-arcane-infiltrator',
  'arcane-omens': 'feat-arcane-omens',
  'arcane-overload': 'feat-arcane-overload',
  'arcane-safeguard': 'feat-arcane-safeguard',
  'arcane-undertaker': 'feat-arcane-undertaker',
  'child-of-the-sun': 'feat-child-of-the-sun',
  'cult-of-the-dragon-initiate': 'feat-cult-of-the-dragon-initiate',
  'emerald-enclave-fledgling': 'feat-emerald-enclave-fledgling',
  'familiar-friend': 'feat-familiar-friend',
  'harper-agent': 'feat-harper-agent',
  'lords-alliance-agent': 'feat-lords-alliance-agent',
  'portal-jumper': 'feat-portal-jumper',
  'purple-dragon-rook': 'feat-purple-dragon-rook',
  'shadowmoor-hexer': 'feat-shadowmoor-hexer',
  'spellfire-spark': 'feat-spellfire-spark',
  'survivor': 'feat-survivor',
  'tireless-reveler': 'feat-tireless-reveler',
  'transmuted-anatomy': 'feat-transmuted-anatomy',
  'tyro-of-the-gauntlet': 'feat-tyro-of-the-gauntlet',
  'vampire-hunter': 'feat-vampire-hunter',
  'vampires-plaything': 'feat-vampires-plaything',
  'zhentarim-ruffian': 'feat-zhentarim-ruffian',
  'actor': 'feat-actor',
  'athlete': 'feat-athlete',
  'archery': 'feat-archery',
  'blind-fighting': 'feat-blind-fighting',
  'bloodlust': 'feat-bloodlust',
  'bomber': 'feat-bomber',
  'charger': 'feat-charger',
  'chef': 'feat-chef',
  'cold-caster': 'feat-cold-caster',
  'crossbow-expert': 'feat-crossbow-expert',
  'crusher': 'feat-crusher',
  'defense': 'feat-defense',
  'defensive-duelist': 'feat-defensive-duelist',
  'dragonscarred': 'feat-dragonscarred',
  'dual-wielder': 'feat-dual-wielder',
  'dueling': 'feat-dueling',
  'durable': 'feat-durable',
  'elemental-adept': 'feat-elemental-adept',
  'elemental-familiar': 'feat-elemental-familiar',
  'fey-touched': 'feat-fey-touched',
  'grappler': 'feat-grappler',
  'heavy-armor-master': 'feat-heavy-armor-master',
  'inspiring-leader': 'feat-inspiring-leader',
  'keen-mind': 'feat-keen-mind',
  'light-bringer': 'feat-light-bringer',
  'mage-slayer': 'feat-mage-slayer',
  'mounted-combatant': 'feat-mounted-combatant',
  'observant': 'feat-observant',
  'piercer': 'feat-piercer',
  'poisoner': 'feat-poisoner',
  'polearm-master': 'feat-polearm-master',
  'protection': 'feat-protection',
  'ritual-caster': 'feat-ritual-caster',
  'sentinel': 'feat-sentinel',
  'sharpshooter': 'feat-sharpshooter',
  'shield-master': 'feat-shield-master',
  'skulker': 'feat-skulker',
  'slasher': 'feat-slasher',
  'speedy': 'feat-speedy',
  'spell-sniper': 'feat-spell-sniper',
  'telekinetic': 'feat-telekinetic',
  'telepathic': 'feat-telepathic',
  'unarmed-fighting': 'feat-unarmed-fighting',
  'war-caster': 'feat-war-caster',
  'weapon-master': 'feat-weapon-master',
  'aberrant-anatomy': 'feat-aberrant-anatomy',
  'aberrant-dragonmark': 'feat-aberrant-dragonmark',
  'ability-score-improvement': 'feat-ability-score-improvement',
  'abjuration-adept': 'feat-abjuration-adept',
  'arcane-warrior': 'feat-arcane-warrior',
  'boon-of-blazing-dawn': 'feat-boon-of-blazing-dawn',
  'boon-of-bloodshed': 'feat-boon-of-bloodshed',
  'boon-of-bountiful-health': 'feat-boon-of-bountiful-health',
  'boon-of-combat-prowess': 'feat-boon-of-combat-prowess',
  'boon-of-communication': 'feat-boon-of-communication',
  'boon-of-desperate-resilience': 'feat-boon-of-desperate-resilience',
  'boon-of-dimensional-travel': 'feat-boon-of-dimensional-travel',
  'boon-of-energy-resistance': 'feat-boon-of-energy-resistance',
  'boon-of-erupting-spellpower': 'feat-boon-of-erupting-spellpower',
  'boon-of-exquisite-radiance': 'feat-boon-of-exquisite-radiance',
  'boon-of-fate': 'feat-boon-of-fate',
  'boon-of-fluid-forms': 'feat-boon-of-fluid-forms',
  'boon-of-fortitude': 'feat-boon-of-fortitude',
  'boon-of-fortunes-favor': 'feat-boon-of-fortunes-favor',
  'boon-of-irresistible-offense': 'feat-boon-of-irresistible-offense',
  'boon-of-looming-shadows': 'feat-boon-of-looming-shadows',
  'boon-of-magic-school-mastery': 'feat-boon-of-magic-school-mastery',
  'boon-of-misty-escape': 'feat-boon-of-misty-escape',
  'boon-of-poison-mastery': 'feat-boon-of-poison-mastery',
  'boon-of-recovery': 'feat-boon-of-recovery',
  'boon-of-revelry': 'feat-boon-of-revelry',
  'boon-of-siberys': 'feat-boon-of-siberys',
  'boon-of-skill': 'feat-boon-of-skill',
  'boon-of-speed': 'feat-boon-of-speed',
  'boon-of-spell-recall': 'feat-boon-of-spell-recall',
  'boon-of-terror': 'feat-boon-of-terror',
  'boon-of-the-bright-sun': 'feat-boon-of-the-bright-sun',
  'boon-of-the-furious-storm': 'feat-boon-of-the-furious-storm',
  'boon-of-the-iron-mind': 'feat-boon-of-the-iron-mind',
  'boon-of-the-night-spirit': 'feat-boon-of-the-night-spirit',
  'boon-of-the-soul-drinker': 'feat-boon-of-the-soul-drinker',
  'boon-of-truesight': 'feat-boon-of-truesight',
  'cloying-mists': 'feat-cloying-mists',
  'conjuration-adept': 'feat-conjuration-adept',
  'delicious-pain': 'feat-delicious-pain',
  'divination-adept': 'feat-divination-adept',
  'echoing-soul': 'feat-echoing-soul',
  'enchantment-adept': 'feat-enchantment-adept',
  'enclave-magic': 'feat-enclave-magic',
  'evocation-adept': 'feat-evocation-adept',
  'fairy-trickster': 'feat-fairy-trickster',
  'fey-pact': 'feat-fey-pact',
  'fey-sentinel': 'feat-fey-sentinel',
  'gathered-whispers': 'feat-gathered-whispers',
  'genie-magic': 'feat-genie-magic',
  'great-weapon-fighting': 'feat-great-weapon-fighting',
  'great-weapon-master': 'feat-great-weapon-master',
  'greater-aberrant-mark': 'feat-greater-aberrant-mark',
  'greater-mark-of-detection': 'feat-greater-mark-of-detection',
  'greater-mark-of-finding': 'feat-greater-mark-of-finding',
  'greater-mark-of-handling': 'feat-greater-mark-of-handling',
  'greater-mark-of-healing': 'feat-greater-mark-of-healing',
  'greater-mark-of-hospitality': 'feat-greater-mark-of-hospitality',
  'greater-mark-of-making': 'feat-greater-mark-of-making',
  'greater-mark-of-passage': 'feat-greater-mark-of-passage',
  'greater-mark-of-scribing': 'feat-greater-mark-of-scribing',
  'greater-mark-of-sentinel': 'feat-greater-mark-of-sentinel',
  'greater-mark-of-shadow': 'feat-greater-mark-of-shadow',
  'greater-mark-of-storm': 'feat-greater-mark-of-storm',
  'greater-mark-of-warding': 'feat-greater-mark-of-warding',
  'harper-teamwork': 'feat-harper-teamwork',
  'heavily-armored': 'feat-heavily-armored',
  'illusion-adept': 'feat-illusion-adept',
  'infernal-bulwark': 'feat-infernal-bulwark',
  'infernal-dragoon': 'feat-infernal-dragoon',
  'infernal-pact': 'feat-infernal-pact',
  'interception': 'feat-interception',
  'lightly-armored': 'feat-lightly-armored',
  'living-shadow': 'feat-living-shadow',
  'lordly-resolve': 'feat-lordly-resolve',
  'love-bites': 'feat-love-bites',
  'magic-connoisseur': 'feat-magic-connoisseur',
  'mark-of-detection': 'feat-mark-of-detection',
  'mark-of-finding': 'feat-mark-of-finding',
  'mark-of-handling': 'feat-mark-of-handling',
  'mark-of-healing': 'feat-mark-of-healing',
  'mark-of-hospitality': 'feat-mark-of-hospitality',
  'mark-of-making': 'feat-mark-of-making',
  'mark-of-passage': 'feat-mark-of-passage',
  'mark-of-scribing': 'feat-mark-of-scribing',
  'mark-of-sentinel': 'feat-mark-of-sentinel',
  'mark-of-shadow': 'feat-mark-of-shadow',
  'mark-of-storm': 'feat-mark-of-storm',
  'mark-of-warding': 'feat-mark-of-warding',
  'martial-weapon-training': 'feat-martial-weapon-training',
  'medium-armor-master': 'feat-medium-armor-master',
  'mist-walker': 'feat-mist-walker',
  'moderately-armored': 'feat-moderately-armored',
  'mythal-touched': 'feat-mythal-touched',
  'necromancy-adept': 'feat-necromancy-adept',
  'orders-resilience': 'feat-orders-resilience',
  'otherworldly-familiar': 'feat-otherworldly-familiar',
  'pack-fighting': 'feat-pack-fighting',
  'potent-dragonmark': 'feat-potent-dragonmark',
  'prone-fighting': 'feat-prone-fighting',
  'purple-dragon-commandant': 'feat-purple-dragon-commandant',
  'putrefy': 'feat-putrefy',
  'rebuke': 'feat-rebuke',
  'resilient': 'feat-resilient',
  'second-skin': 'feat-second-skin',
  'shadow-touched': 'feat-shadow-touched',
  'shifting-combatant': 'feat-shifting-combatant',
  'skill-expert': 'feat-skill-expert',
  'soothing-familiar': 'feat-soothing-familiar',
  'spell-resistant': 'feat-spell-resistant',
  'spell-subterfuge': 'feat-spell-subterfuge',
  'spellfire-adept': 'feat-spellfire-adept',
  'street-justice': 'feat-street-justice',
  'symbiotic-being': 'feat-symbiotic-being',
  'tactical-combatant': 'feat-tactical-combatant',
  'thrown-weapon-fighting': 'feat-thrown-weapon-fighting',
  'touch-of-death': 'feat-touch-of-death',
  'transmutation-adept': 'feat-transmutation-adept',
  'treacherous-allure': 'feat-treacherous-allure',
  'two-weapon-fighting': 'feat-two-weapon-fighting',
  'vampire-touched': 'feat-vampire-touched',
  'warlike-familiar': 'feat-warlike-familiar',
  'watchers': 'feat-watchers',
  'zhentarim-tactics': 'feat-zhentarim-tactics',
};
const backgroundEmblems = {
  acolyte: 'origin-acolyte', archaeologist: 'origin-explorer', artisan: 'origin-artisan',
  criminal: 'origin-outlaw', farmer: 'origin-farmer', guard: 'origin-guard', merchant: 'origin-merchant',
  noble: 'origin-noble', sage: 'origin-scholar', sailor: 'origin-sailor', scribe: 'origin-scribe',
  soldier: 'origin-soldier', wayfarer: 'origin-traveler',
  'aberrant-heir': 'origin-aberrant-heir',
  'bejeweled-conclave-spy': 'origin-bejeweled-conclave-spy',
  'carouser': 'origin-carouser',
  'charlatan': 'origin-charlatan',
  'chondathan-freebooter': 'origin-chondathan-freebooter',
  'cosmic-dawn-experiment': 'origin-cosmic-dawn-experiment',
  'covenant-of-the-grave-recruit': 'origin-covenant-of-the-grave-recruit',
  'crucible-storm-chaser': 'origin-crucible-storm-chaser',
  'dead-magic-dweller': 'origin-dead-magic-dweller',
  'dragon-cultist': 'origin-dragon-cultist',
  'emerald-enclave-caretaker': 'origin-emerald-enclave-caretaker',
  'familiar-trainer': 'origin-familiar-trainer',
  'flaming-fist-mercenary': 'origin-flaming-fist-mercenary',
  'genie-touched': 'origin-genie-touched',
  'harper': 'origin-harper',
  'haunted-one': 'origin-haunted-one',
  'hermit': 'origin-hermit',
  'horizon-weaver-initiate': 'origin-horizon-weaver-initiate',
  'house-agent': 'origin-house-agent',
  'house-cannith-heir': 'origin-house-cannith-heir',
  'house-deneith-heir': 'origin-house-deneith-heir',
  'house-ghallanda-heir': 'origin-house-ghallanda-heir',
  'house-jorasco-heir': 'origin-house-jorasco-heir',
  'house-kundarak-heir': 'origin-house-kundarak-heir',
  'house-lyrandar-heir': 'origin-house-lyrandar-heir',
  'house-medani-heir': 'origin-house-medani-heir',
  'house-orien-heir': 'origin-house-orien-heir',
  'house-phiarlan-heir': 'origin-house-phiarlan-heir',
  'house-sivis-heir': 'origin-house-sivis-heir',
  'house-tharashk-heir': 'origin-house-tharashk-heir',
  'house-thuranni-heir': 'origin-house-thuranni-heir',
  'house-vadalis-heir': 'origin-house-vadalis-heir',
  'ice-fisher': 'origin-ice-fisher',
  'inquisitive': 'origin-inquisitive',
  'investigator': 'origin-investigator',
  'knight-of-the-gauntlet': 'origin-knight-of-the-gauntlet',
  'lords-alliance-vassal': 'origin-lords-alliance-vassal',
  'lorwyn-expert': 'origin-lorwyn-expert',
  'mist-wanderer': 'origin-mist-wanderer',
  'moonwell-pilgrim': 'origin-moonwell-pilgrim',
  'mulhorandi-tomb-raider': 'origin-mulhorandi-tomb-raider',
  'mythalkeeper': 'origin-mythalkeeper',
  'pact-seeker': 'origin-pact-seeker',
  'phantasmic-circus-trouper': 'origin-phantasmic-circus-trouper',
  'purple-dragon-squire': 'origin-purple-dragon-squire',
  'rashemi-wanderer': 'origin-rashemi-wanderer',
  'seer-apprentice': 'origin-seer-apprentice',
  'shadowmasters-exile': 'origin-shadowmasters-exile',
  'shadowmoor-expert': 'origin-shadowmoor-expert',
  'spellfire-initiate': 'origin-spellfire-initiate',
  'spirit-medium': 'origin-spirit-medium',
  'vampire-devotee': 'origin-vampire-devotee',
  'vampire-survivor': 'origin-vampire-survivor',
  'ward-of-the-sheltering-hands': 'origin-ward-of-the-sheltering-hands',
  'zhentarim-mercenary': 'origin-zhentarim-mercenary',
  'agent-of-the-ninth-quill': 'origin-agent-of-the-ninth-quill',
  'entertainer': 'origin-entertainer',
  'guide': 'origin-guide',
};
const toolEmblems = { artisan: 'artificer', gaming: 'ability-jester', instrument: 'bard', other: 'divination' };

function entryAbility(category, entry) {
  const name = category === 'backgrounds' ? entry.abilityScores?.[0]
    : category === 'glossary' && entry.kind?.endsWith(' skill') ? entry.kind.split(' ')[0]
    : undefined;
  return abilities.find(([, english]) => english === name)?.[0];
}

function classEmblemId(id, subclassId) {
  return subclassEmblems[subclassId] ?? classEmblemOverrides[id] ?? (classEmblems.has(id) ? id : 'weapon');
}

function catalogEmblem(category, entry) {
  const { id } = entry;
  if (category === 'subclasses') return gameIcon(classEmblemId(classEntry(entry.class)?.id, id), 'game-emblem');
  if (category === 'classes') return gameIcon(classEmblemId(id), 'game-emblem');
  if (category === 'species') return gameIcon(speciesEmblems[id] ?? 'species', 'game-emblem');
  if (category === 'backgrounds') return gameIcon(backgroundEmblems[id]
    ?? 'origin-traveler', 'game-emblem');
  if (category === 'feats') return gameIcon(namedFeatEmblems[id] ?? featEmblems[entry.category] ?? 'radiant', 'game-emblem');
  if (category === 'tools') return gameIcon(toolEmblems[entry.group] ?? 'artificer', 'game-emblem');
  if (category === 'languages') return gameIcon(entry.tier === 'rare' ? 'divination' : 'ability-book', 'game-emblem');
  if (category === 'magias') return spellIcon(entry);
  return gameIcon(categoryEmblems[category] ?? 'ability-book', 'game-emblem');
}

function catalogTheme(category, entry) {
  if (category === 'magias') return spellTheme(entry);
  if (category === 'feats') return ` data-feat-theme="${escape(entry.category)}"`;
  if (category === 'tools') return ` data-tool-theme="${escape(entry.group)}"`;
  if (category === 'languages') return ` data-language-theme="${escape(entry.tier)}"`;
  if (category === 'rules') return ` data-rule-theme="${escape(entry.category)}"`;
  const ability = entryAbility(category, entry);
  if (ability) return ` data-ability="${ability}"`;
  if (category === 'species') return ` data-species-theme="${escape(entry.id)}"`;
  const id = category === 'classes' ? entry.id
    : category === 'subclasses' ? classEntry(entry.class)?.id : undefined;
  return id ? ` data-class-theme="${escape(id)}"` : '';
}

function optionCategory(entry) {
  if (entry.collection === 'fighting-styles') return 'feats';
  return entry.collection ?? (entry.category && catalog.byFeat.has(entry.id) ? 'feats' : undefined);
}

function characterEmblem(classes) {
  const track = classes[0];
  return track ? `<span class="character-emblem"${catalogTheme('classes', track.entry)}>${gameIcon(classEmblemId(track.entry.id, track.subclass?.id), 'game-emblem')}</span>`
    : gameIcon('species', 'game-emblem');
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
      <a href="${characterLink(character)}">
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
  return `<a class="button ${style}" href="#novo">Criar personagem</a>`;
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
    .join('')}<a class="icon-label" href="#novo"><span aria-hidden="true">+</span>Criar personagem</a></nav>`;
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

function publicCharacterTags(classes, level, species) {
  return `<span class="public-tags">
    ${classes.map(({ entry, levels, subclass }) => `<span class="tag public-tag"${catalogTheme('classes', entry)}>${escape(displayName(entry))} nível ${levels.length}</span>
      ${subclass ? `<span class="tag public-tag"${catalogTheme('classes', entry)}>${gameIcon(classEmblemId(entry.id, subclass.id))}${escape(displayName(entry))} · ${escape(displayName(subclass))}</span>` : ''}`).join('')}
    ${species ? `<a class="tag public-tag public-species" href="${compendiumHref('species', species.id)}"${catalogTheme('species', species)}>${gameIcon(speciesEmblems[species.id] ?? 'species')}${escape(displayName(species))}</a>` : ''}
    <span class="tag">Nível total ${level}</span>
  </span>`;
}

function galleryFilterControls() {
  const classes = sortEntries(catalog.classes);
  const parent = galleryFilters.class && classEntry(galleryFilters.class);
  const subclasses = sortEntries(catalog.subclasses.filter((entry) => !parent || entry.class === parent.name));
  return filterControls([
    ['class', 'Classe', 'Todas', classes.map((entry) => [entry.id, displayName(entry)])],
    ['subclass', 'Subclasse', 'Todas', subclasses.map((entry) => [entry.id, displayName(entry), entry])],
  ], galleryFilters);
}

function loadGallery(page) {
  const params = new URLSearchParams({ page: String(page) });
  if (gallerySearch.trim()) params.set('search', gallerySearch.trim());
  if (galleryFilters.class) params.set('classId', galleryFilters.class);
  if (galleryFilters.subclass) params.set('subclassId', galleryFilters.subclass);
  const query = params.toString();
  if (gallery?.query === query) return;
  const request = { page, query, filtered: params.size > 1 };
  gallery = request;
  characterRequest('/public?' + query, {}, false)
    .then((result) => Object.assign(request, result))
    .catch((error) => { request.error = error; })
    .finally(() => {
      const results = main.querySelector('#gallery-results');
      if (gallery === request && results) results.innerHTML = galleryResults(request);
    });
}

function galleryResults({ page, documents, hasMore, error, filtered }) {
  const incompatibleSearch = filtered && error?.code === 'INVALID_INPUT';
  const content = error
    ? `<div class="gallery-empty">
        ${gameIcon('alarm', 'game-emblem')}
        <h2>${incompatibleSearch ? 'Busca indisponível nesta versão' : 'Galeria indisponível'}</h2>
        <p class="muted">${incompatibleSearch ? 'Atualize o servidor para usar a busca e os filtros.' : 'Tente carregar as fichas novamente.'}</p>
        <button type="button" class="button secondary" data-retry-gallery>Tentar novamente</button>
      </div>`
    : !documents
      ? '<p role="status">Carregando fichas públicas…</p>'
      : documents.length
        ? `<ul class="character-list public-gallery-list">${documents.map((character) => {
          const classes = plannedClasses(character, catalog);
          return `<li><a href="#publica/${escape(character.id)}">
            ${characterEmblem(classes)}
            <span class="public-gallery-name"><strong>${escape(title(character))}</strong>${publicCharacterTags(classes, classPlan(character).length)}</span>
            ${publicAuthor(character)}<span class="public-gallery-arrow" aria-hidden="true">›</span>
          </a></li>`;
        }).join('')}</ul>`
        : `<div class="gallery-empty">
            ${gameIcon('divination', 'game-emblem')}
            <h2>${filtered ? 'Nenhum resultado encontrado' : 'Nenhuma ficha pública nesta página'}</h2>
            ${filtered ? '<p class="muted">Tente outro termo ou limpe os filtros para ver todas as fichas.</p><button type="button" class="button secondary" data-clear-gallery>Limpar busca e filtros</button>' : ''}
          </div>`;
  return `${content}
    <div class="hub-actions">
      ${page > 1 ? `<a class="button secondary" href="#galeria/${page - 1}">Página anterior</a>` : ''}
      ${hasMore ? `<a class="button secondary" href="#galeria/${page + 1}">Próxima página</a>` : ''}
    </div>`;
}

function publicGallery(page) {
  loadGallery(page);
  return hubShell('galeria', `<section class="panel public-gallery"><h1>Galeria pública</h1>
    <div class="gallery-search"><label for="gallery-search">Buscar na galeria</label>
      <input type="search" id="gallery-search" maxlength="120" value="${escape(gallerySearch)}"
        aria-describedby="gallery-search-help" placeholder="Nome, classe, talento, antecedente…">
      <small id="gallery-search-help">Comece com @ para buscar pelo usuário que publicou a ficha.</small></div>
    <div data-gallery-filters>${galleryFilterControls()}</div>
    <div id="gallery-results" aria-live="polite">${galleryResults(gallery)}</div>
  </section>`);
}

function refreshGallerySearch() {
  clearTimeout(gallerySearchTimer);
  history.replaceState(history.state, '', '#galeria');
  loadGallery(1);
  const results = main.querySelector('#gallery-results');
  if (results) results.innerHTML = galleryResults(gallery);
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
            ${featured.saved ? `<a class="button secondary icon-label" href="${characterLink(featured)}">${gameIcon('ability-book')}Abrir ficha</a>` : ''}
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
        return `<li><a href="${characterLink(character)}">
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

function spellFilterControls(spells, filters = {}) {
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
  const groups = [
    ['level', 'Círculo', 'Todos', levels.map((level) => [String(level), level ? `${level}º` : 'Truque'])],
    ['school', 'Escola', 'Todas', schools],
    ['damage', 'Tipo de dano', 'Todos', damage],
    ['publication', 'Fonte', 'Todas', publications.map((book) => [book, book])],
  ];
  return filterControls(groups, filters);
}

function filterControls(groups, filters) {
  return `<div class="spell-filter-groups">${groups.filter(([, , , options]) => options.length)
    .map(([key, label, all, options]) => `<fieldset class="spell-filter-group">
      <legend>${label}</legend><div class="spell-filter-options">${[['', all], ...options].map(([id, name, entry], index) => {
        const color = !id ? '' : {
          level: `data-spell-circle="${escape(id)}"`,
          school: `data-spell-school="${escape(id)}"`,
          damage: `data-damage="${escape(id)}"`,
          publication: `data-source-color="${(index - 1) % 6}"`,
          class: `data-class-theme="${escape(id)}"`,
          subclass: entry ? catalogTheme('subclasses', entry) : '',
          ability: `data-ability="${escape(id)}"`,
          featType: `data-feat-theme="${escape(id)}"`,
          skill: skillAbilities[id] ? `data-ability="${skillAbilities[id]}"` : '',
        }[key];
        const emblem = { school: schoolEmblem, damage: damageEmblem, class: classEmblemId, ability: (id) => abilityEmblems[id], featType: (id) => featEmblems[id] }[key];
        const icon = entry ? gameIcon(classEmblemId(classEntry(entry.class)?.id, id))
          : id && emblem ? gameIcon(emblem(id)) : '';
        const title = id && key === 'level' ? spellCircle(Number(id)) : name;
        return `<button class="tag spell-filter-option${id && key === 'damage' ? ' damage-tag' : ''}" type="button"
          data-spell-filter="${key}" value="${escape(id)}" ${color} aria-label="${escape(title)}"
          aria-pressed="${(filters[key] ?? '') === id}">${icon}${escape(name)}</button>`;
      }).join('')}</div></fieldset>`).join('')}</div>`;
}

function catalogFilterControls() {
  const entries = catalog[catalogCategory];
  const sources = [...new Set(entries.map(({ source }) => source).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const classes = catalogCategory === 'subclasses'
    ? sortEntries(catalog.classes.filter((cls) => entries.some((entry) => entry.class === cls.name)))
    : [];
  return filterControls([
    ['class', 'Classe', 'Todas', classes.map((cls) => [cls.id, displayName(cls)])],
    ['publication', 'Fonte', 'Todas', sources.map((source) => [source, source])],
    ['ability', 'Atributo', 'Todos', catalogCategory === 'backgrounds'
      ? abilities.map(([id, , label]) => [id, label]) : []],
    ['featType', 'Tipo de talento', 'Todos', catalogCategory === 'feats'
      ? [...new Set(entries.map(({ category }) => category).filter(Boolean))]
          .map((type) => [type, featCategories[type] ?? type])
          .sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))
      : []],
  ], catalogFilters);
}

function applySpellFilter(button, filters) {
  const { spellFilter } = button.dataset;
  const value = button.value === filters[spellFilter] ? '' : button.value;
  filters[spellFilter] = value;
  button.closest('.spell-filter-options').querySelectorAll('[data-spell-filter]').forEach((option) => {
    option.setAttribute('aria-pressed', String(option.value === value));
  });
}

function compendiumResults() {
  const query = normalizeSearch(catalogFilter.trim());
  const attribute = abilities.find(([id]) => id === catalogFilters.ability)?.[1];
  const parentClass = catalogCategory === 'subclasses' && classEntry(catalogFilters.class)?.name;
  const entries =
    catalogCategory === 'magias'
      ? filterSpells(catalog.spells, { ...catalogSpellFilters, search: catalogFilter })
      : catalog[catalogCategory].filter(
          (entry) =>
            (!catalogFilters.publication || entry.source === catalogFilters.publication) &&
            (!parentClass || entry.class === parentClass) &&
            (!attribute || entry.abilityScores?.includes(attribute)) &&
            (!catalogFilters.featType || entry.category === catalogFilters.featType) &&
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
    : [category === 'subclasses' && classLabel(entry.class), category === 'feats' && featCategories[entry.category], entry.source]
      .filter(Boolean).map((tag) => `<span class="tag">${escape(tag)}</span>`).join(' ');
  return `<a class="navigation-row wiki-result"${catalogTheme(category, entry)} href="${compendiumHref(category, entry.id)}">
    ${catalogEmblem(category, entry)}
    <span class="wiki-result-content grid grid-cols-1 gap-[0.22rem]"><strong>${escape(displayName(entry))}</strong>
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
      return [`<a class="entry wiki-link" href="${characterLink(character)}">
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
      ${catalogCategory === 'magias' ? spellFilterControls(catalog.spells, catalogSpellFilters) : catalogFilterControls()}
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
        ].map(([href, label]) => `<li><a class="navigation-row" href="${href}">
          ${gameIcon('ability-book', 'game-emblem')}<span>${label}</span><span aria-hidden="true">›</span>
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
  const classId = catalogCategory === 'classes' ? entry.id : parent?.id;
  const speciesId = catalogCategory === 'species' ? entry.id : undefined;
  const isBackground = catalogCategory === 'backgrounds';
  const motif = speciesId
    ? speciesEmblems[speciesId] ?? 'species'
    : isBackground
      ? backgroundEmblems[entry.id] ?? 'origin-traveler'
      : classId && classEmblemId(classId, catalogCategory === 'subclasses' ? entry.id : undefined);
  const articleTheme = isSpell ? spellTheme(entry, true) : catalogTheme(catalogCategory, entry);
  const editorial = isCharacterArticle || isBackground;
  const isReference = ['rules', 'glossary'].includes(catalogCategory);
  const relatedRules = isReference ? (entry.related ?? []).flatMap((key) => {
    const rule = catalog.rules.find(({ id }) => id === key);
    return rule ? [rule] : [];
  }) : [];
  document.title = displayName(entry) + ' · Compêndio · Grimório';
  return `<article class="wiki-article ${editorial ? 'wiki-character-article' : ''} ${isReference ? 'wiki-reference' : ''} ${isSpell ? 'wiki-spell-article' : ''}"${articleTheme}>
    <nav class="flex flex-wrap gap-2" aria-label="Navegação do verbete">${back}${parent ? `<a class="button secondary icon-label" href="${compendiumHref('classes', parent.id)}">${catalogEmblem('classes', parent)}${escape(displayName(parent))}</a>` : ''}</nav>
    <header class="wiki-article-header${isBackground ? ' wiki-background-header' : ''}">
      ${motif ? `<span class="wiki-banner-emblem" aria-hidden="true">${gameIcon(motif)}</span>` : ''}
      ${isSpell ? `
        <span class="wiki-spell-emblem">${catalogEmblem(catalogCategory, entry)}</span>
        <h2><span class="wiki-spell-name">${escape(displayName(entry))}</span></h2>
        <p class="wiki-spell-school icon-label">${Object.hasOwn(spellSchools, entry.school) ? gameIcon(schoolEmblem(entry.school)) : ''}<span>${escape(spellSubtitle(entry))}</span></p>` : `<h2 class="icon-label">${catalogEmblem(catalogCategory, entry)}<span>${escape(displayName(entry))}</span></h2>
      <p class="muted">${[catalogCategory === 'feats' && featCategories[entry.category], entry.source].filter(Boolean).map(escape).join(' · ')}</p>`}
    </header>
    ${isSpell ? spellDescription(entry, { glossary: true, editorial: true }) : isReference
      ? `<section class="wiki-reference-body">${entryDescription(entry, true, true, ruleReference)}</section>`
      : optionDetails(entry, true, editorial)}
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
        <ul class="mt-2 flex list-none flex-wrap gap-2 p-0 [&>li]:min-w-0 [&>li]:flex-[1_1_19rem]">${related.spells
          .filter((spell) => spell.level === level)
          .map((spell) => `<li>${articleLink('magias', spell)}</li>`)
          .join('')}</ul></details>`
        )
        .join('')}</section>`
        : ''
    }
  </article>`;
}

function chipSelect(id, label, choices, { value = choices[0]?.[0], name, play = false } = {}) {
  const selected = choices.some(([key]) => key === value) ? value : choices[0]?.[0];
  return `<fieldset class="spell-filter-group chip-select">
    <legend>${escape(label)}</legend>
    <select hidden${id ? ` id="${escape(id)}"` : ''}${name ? ` name="${escape(name)}"` : ''}${play ? ' data-play-control' : ''}>
      ${choices.map(([key, text, disabled]) => `<option value="${escape(key)}" ${key === selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escape(text)}</option>`).join('')}
    </select>
    <div class="spell-filter-options">
      ${choices.map(([key, text, disabled, color = ''], index) => `<button type="button" class="tag spell-filter-option"
        data-chip-value="${escape(key)}" ${color || `data-source-color="${index % 6}"`} ${disabled ? 'disabled' : ''}
        aria-pressed="${key === selected}">${escape(text)}</button>`).join('')}
    </div></fieldset>`;
}

function setChipValue(select, value) {
  select.value = value;
  select.closest('.chip-select').querySelectorAll('[data-chip-value]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.chipValue === select.value));
  });
}

function chooseChip(chip) {
  const select = chip.closest('.chip-select').querySelector('select');
  if (select.value === chip.dataset.chipValue) return;
  setChipValue(select, chip.dataset.chipValue);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function select(field, label, values, selected) {
  return chipSelect(field, label, [
    ['', 'Selecione…'],
    ...values.map((option) => [option.id, [displayName(option), option.source].filter(Boolean).join(' · ')]),
  ], { name: field, value: selected });
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

function familiarDescription(entry, glossary, referenceLink) {
  const original = entry.body ?? '';
  const localized = entry.translation?.body;
  const stats = rulesDescriptionParts(original || localized).find(({ columns }) => columns?.length === 4);
  const labels = { STR: 'FOR', DEX: 'DES', CON: 'CON', INT: 'INT', WIS: 'SAB', CHA: 'CAR' };
  const table = stats ? rulesTable(['Atributo', 'Valor', 'Modificador', 'Teste de resistência'],
    stats.rows.map(([id, ...values]) => [labels[id] ?? id, ...values]), glossary) : '';
  const prose = (parts) => parts.filter(({ text }) => text).map(({ text }) =>
    text.replace(/^\*\*(Características|Ações|Ações bônus|Reações|Conjuração)\*\*\s*$/gm, '### $1')
  ).join('\n\n');
  const parts = rulesDescriptionParts(localized || original);
  const tableIndex = parts.findIndex(({ columns }) => columns?.length === 4);
  const intro = prose(parts.slice(0, Math.max(0, tableIndex)));
  const translatedText = prose(parts.slice(Math.max(0, tableIndex + 1)));
  const originalSections = original.match(/^\*\*/gm)?.length ?? 0;
  const translatedSections = localized?.match(/^\*\*/gm)?.length ?? 0;
  const language = localized ? 'pt-BR' : 'en';
  return `<div class="familiar-stat-block">${formatRulesDescription(intro, glossary, language, referenceLink)}
    ${table}${formatRulesDescription(translatedText, glossary, language, referenceLink)}
    ${localized && original && translatedSections < originalSections
      ? `<section><h4>Ficha original completa</h4>${formatRulesDescription(original, glossary, 'en', referenceLink)}</section>`
      : localized && original ? originalDescription(entry.name, original, glossary, referenceLink) : ''}</div>`;
}

function entryDescription(entry, full = false, glossary = false, referenceLink) {
  if (entry.familiarForm) return familiarDescription(entry, glossary, referenceLink);
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

function publicFeatureSource(entry) {
  if (!entry.source) return;
  const [kind, id] = entry.key?.split('/') ?? [];
  const collection = { class: 'classes', subclass: 'subclasses', species: 'species', background: 'backgrounds' }[kind];
  const parent = collection ? catalog[collection].find((item) => item.id === id)
    : [projection.species, projection.background, ...projection.classes.flatMap(({ entry, subclass }) => [entry, subclass])]
      .find((item) => item && displayName(item) === entry.source);
  const feat = !parent && catalog.feats.find((item) => displayName(item) === entry.source);
  const category = parent?.collection ?? (feat ? 'feats' : undefined);
  const origin = parent || feat;
  return {
    badge: `<span class="tag public-tag"${origin ? catalogTheme(category, origin) : ''}>${origin ? catalogEmblem(category, origin) : gameIcon('feat-skilled')}${escape(entry.source)}</span>`,
    href: origin ? compendiumHref(category, origin.id) : '',
  };
}

function details(entry, glossary = true, full = false) {
  const inSheet = publicSheet || main.classList.contains('session-screen');
  const origin = inSheet ? publicFeatureSource(entry) : undefined;
  const feat = inSheet && entry.category && catalog.byFeat.get(entry.id);
  const reference = feat ? compendiumHref('feats', feat.id) : origin?.href;
  return `<details class="entry${origin || reference ? ' public-feature' : ''}"><summary><strong>${escape(displayName(entry))}</strong>
    <span class="entry-tags">${origin?.badge ?? ''}
    ${entry.level ? `<span class="tag">Nível ${entry.level}</span>` : ''}
    ${(entry.translation?.tags ?? []).map((tag) => `<span class="tag">${escape(tag)}</span>`).join('')}</span></summary>
    ${reference ? `<a class="public-feature-link" href="${reference}"
      aria-label="Ver ${escape(feat ? displayName(feat) : entry.source)} no compêndio">Compêndio <span aria-hidden="true">›</span></a>`
      : entry.source && !origin ? `<p class="muted">${escape(entry.source)}</p>` : ''}
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
        const category = optionCategory(entry);
        return spell
          ? `<li class="icon-label"${spellTheme(spell)}>${spellIcon(spell)}${escape(spellName(spell))}</li>`
          : `<li class="icon-label"${catalogTheme(category, entry)}>${category ? catalogEmblem(category, entry) : ''}${escape(displayName(entry))}</li>`;
      }).join('')}</ul>`
        : ''
    }
  </div>`;
}

const originBoostEdits = new Map();

function originBoostEditor(group) {
  const stored = group.options.find(({ id }) => id === group.selected[0])?.increases;
  const keys = [...new Set(group.options.flatMap(({ increases }) => Object.keys(increases ?? {})))];
  const state = originBoostEdits.get(draft.id + '/' + group.key) ?? {
    mode: stored ? (Object.values(stored).includes(2) ? 'split' : 'all') : '',
    plusTwo: keys.find((id) => stored?.[id] === 2),
    plusOne: keys.find((id) => stored?.[id] === 1),
  };
  const inputs = (name, values) => `<div class="builder-inline-options">${values.map(([value, label, disabled]) => {
    const id = `boost:${group.key}:${name}:${value}`;
    return `<label class="builder-inline-choice" for="${escape(id)}"><input type="radio"
      id="${escape(id)}" name="${escape(group.key + '/' + name)}" data-origin-boost="${escape(group.key)}"
      data-boost-part="${name}" value="${escape(value)}" ${state[name] === value ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span>${escape(label)}</span></label>`;
  }).join('')}</div>`;
  return `${inputs('mode', [
    ['split', '+2 e +1', !group.options.some(({ increases }) => Object.values(increases).includes(2))],
    ['all', '+1 em todos', !group.options.some(({ increases }) => Object.values(increases).every((n) => n === 1))],
  ])}
  ${state.mode === 'split' ? `<div class="builder-boost-pair">${[['plusTwo', 2], ['plusOne', 1]].map(([name, points]) =>
    `<fieldset class="spell-filter-group"><legend>+${points}</legend>${inputs(name, keys.map((id) =>
      [id, abilityLabel(id), !group.options.some(({ increases }) => increases[id] === points)]))}</fieldset>`
  ).join('')}</div>` : ''}`;
}

function updateOriginBoost(target) {
  const group = pickerGroup(target.dataset.originBoost);
  if (!group) return;
  const key = draft.id + '/' + group.key;
  const stored = group.options.find(({ id }) => id === group.selected[0])?.increases ?? {};
  const wasSplit = Object.values(stored).includes(2);
  const state = originBoostEdits.get(key) ?? {
    mode: 'split',
    plusTwo: wasSplit ? Object.keys(stored).find((id) => stored[id] === 2) : undefined,
    plusOne: wasSplit ? Object.keys(stored).find((id) => stored[id] === 1) : undefined,
  };
  const part = target.dataset.boostPart;
  state[part] = target.value;
  if (part !== 'mode' && state.plusTwo && state.plusOne &&
      !group.options.some(({ increases }) => increases[state.plusTwo] === 2 && increases[state.plusOne] === 1)) {
    state[part === 'plusTwo' ? 'plusOne' : 'plusTwo'] = undefined;
  }
  originBoostEdits.set(key, state);
  const choice = group.options.find(({ increases }) => state.mode === 'all'
    ? Object.values(increases).every((value) => value === 1)
    : increases[state.plusTwo] === 2 && increases[state.plusOne] === 1);
  draft.selected[group.key] = choice ? [choice.id] : [];
  if (choice) originBoostEdits.delete(key);
  persistChange();
  renderBuilder();
  document.getElementById(target.id)?.focus({ preventScroll: true });
}

function choiceBlock(group) {
  const complete = group.selected.length >= group.count;
  const casting = group.key.endsWith('/casting-ability');
  const languages = group.options.length && group.options.every(({ id }) => catalog.byLanguage.has(id));
  const boosts = group.key.startsWith('background/') && group.key.endsWith('/boost');
  const simple = casting || languages || (group.count <= 3 && group.name === 'Tamanho');
  const lore = {
    int: 'Estudo, fórmulas e compreensão da magia.',
    wis: 'Intuição e percepção das forças ao redor.',
    cha: 'Vontade e presença para dar forma à magia.',
    con: 'Vigor e poder canalizados pelo próprio corpo.',
  };
  return `<section class="choice builder-choice-card ${group.depth ? 'nested' : ''}" data-builder-key="${escape(group.key)}">
    <h3>${escape(group.name)}</h3>
    <div class="builder-choice-meta"><small>${escape(group.source)}${group.section === 'progressao' ? ` · Nível de classe ${group.level}` : ''}</small>
      <span class="tag" data-choice-complete="${complete}">${group.familiarChoice
        ? group.selected.length ? 'Forma registrada' : 'Sem forma registrada'
        : group.optional ? `${group.selected.length} · opcional` : `${group.selected.length} de ${group.count}`}</span></div>
    ${casting ? '<p class="muted">A escolha define como você canaliza estas magias e qual atributo entra na CD e nas jogadas de ataque delas.</p>'
      : boosts ? '<p class="muted">Escolha +2 e +1 em atributos diferentes ou +1 nos três.</p>'
      : group.prompt ? `<p class="muted">${escape(group.prompt)}</p>` : ''}
    ${boosts && group.options.length ? originBoostEditor(group) : simple && group.options.length ? `<div class="builder-inline-options${languages ? ' builder-language-options' : ''}">${group.options.map((entry) => {
      const selected = group.selected.includes(entry.id);
      const id = `inline:${group.key}:${entry.id}`;
      return `<label class="builder-inline-choice" for="${escape(id)}"${casting ? ` data-ability="${escape(entry.id)}"` : ''}>
        <input type="${group.count === 1 && !group.optional ? 'radio' : 'checkbox'}" name="${escape('inline:' + group.key)}" id="${escape(id)}" value="${escape(entry.id)}"
          data-inline-choice="${escape(group.key)}" ${selected ? 'checked' : ''} ${group.count > 1 && complete && !selected ? 'disabled' : ''}>
        <span>${casting ? gameIcon(abilityEmblems[entry.id]) : ''}${escape(displayName(entry))}
        ${casting && lore[entry.id] ? `<small>${lore[entry.id]}</small>` : ''}</span></label>`;
    }).join('')}</div>` : pickerControl(group)}
  </section>`;
}

function benefits(section) {
  const features = projection.features.filter((entry) => !section || entry.section === section);
  return features.length
    ? `<section class="benefits"><h3>Características e habilidades</h3>
    ${features.map((entry) => details(entry)).join('')}</section>`
    : '';
}

function facts(showTags = publicSheet) {
  const skillTags = (ids) => [...ids].map((id) =>
    `<span class="tag public-tag" data-ability="${escape(skillAbilities[id])}">${escape(skillName(id))}</span>`).join('');
  const referenceTags = (ids, entries, category) => [...ids].map((id) => {
    const entry = entries.get(id);
    return entry
      ? `<a class="tag public-tag public-reference-tag" href="${compendiumHref(category, id)}"${catalogTheme(category, entry)}>${escape(displayName(entry))}</a>`
      : `<span class="tag">${escape(id)}</span>`;
  }).join('');
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
  const colored = (name, value) => {
    if (name === 'Perícias proficientes') return skillTags(projection.skills);
    if (name === 'Especializações') return skillTags(projection.expertise);
    if (name === 'Ferramentas proficientes') return referenceTags(projection.tools, catalog.byTool, 'tools');
    if (name === 'Idiomas') return referenceTags(projection.languages, catalog.byLanguage, 'languages');
    if (name === 'Testes de resistência proficientes') return value.split(', ').map((label) => {
      const ability = abilities.find(([, english, localized]) => label === english || label === localized);
      return ability ? `<span class="tag public-tag" data-ability="${ability[0]}">${gameIcon(abilityEmblems[ability[0]])}${escape(label)}</span>` : escape(label);
    }).join(' ');
    return '';
  };
  return `<dl class="facts">${entries
    .map(({ name, value }) => {
      const tags = showTags && colored(name, value);
      return `<div><dt>${escape(name)}</dt><dd${tags ? ' class="public-tags"' : ''}>${tags || escape(value)}</dd></div>`;
    })
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
  const originChoices = [
    ['species', 'species', 'Espécie', projection.species],
    ['background', 'backgrounds', 'Antecedente', projection.background],
  ];
  return `<h2>Origem</h2>
    <div class="builder-name"><label for="name">Nome do personagem</label><input id="name" name="name" maxlength="100" value="${escape(draft.name)}"></div>
    <div class="builder-origin-grid">
      ${originChoices.map(([field, category, label, entry]) => `<button type="button" class="navigation-row builder-origin-choice"
        id="picker:${field}" data-picker="${field}" aria-haspopup="dialog"${entry ? catalogTheme(category, entry) : ''}>
        ${entry ? catalogEmblem(category, entry) : gameIcon(categoryEmblems[category], 'game-emblem')}
        <span><small>${label}</small><strong>${entry ? escape(displayName(entry)) : `Escolher ${label.toLowerCase()}`}</strong></span>
        <span aria-hidden="true">›</span></button>`).join('')}
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
    ${projection.features.some(({ section }) => section === 'origem') ? `<details class="entry"><summary>Características da origem</summary>${benefits('origem')}</details>` : ''}`;
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
    return chipSelect(`roll-${id}`, `Resultado para ${label}`, [
      ['', 'Sem resultado'],
      ...batch.rolls.map(({ score }, index) => [String(index), String(score), taken.includes(index)]),
    ], { name: `roll-${id}`, value: String(batch.assignments[id] ?? '') });
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
              (roll) => `<li><strong>${escape(roll.score)}</strong>
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
    ['array', 'Conjunto padrão', 'Distribua seis valores prontos.', 'ability-book'],
    ['points', 'Compra por pontos', 'Monte a distribuição com 27 pontos.', 'origin-merchant'],
    ['manual', 'Valores rolados', 'Role os dados ou informe seus resultados.', 'feat-lucky'],
  ];
  return `<h2>Atributos</h2><p class="muted">Ajuste os valores base. O valor final já inclui os aumentos da ficha.</p>
    <fieldset class="choice score-method"><legend>Método</legend><div class="score-options">
      ${methods
        .map(
          ([id, label, help, icon]) => `<label><input type="radio" name="method" id="method-${id}" value="${id}"
        ${draft.method === id ? 'checked' : ''}><span><strong class="icon-label">${gameIcon(icon)}${label}</strong><small>${help}</small></span></label>`
        )
        .join('')}
    </div></fieldset>
    ${draft.method === 'array' ? '<p class="muted">Escolher um valor já usado troca os dois atributos automaticamente.</p>' : ''}
    ${draft.method === 'points' ? `<p class="muted">Pontos usados <strong>${points}/${pointBudget}</strong> · Restantes <strong>${pointBudget - points}</strong></p>` : ''}
    ${issue ? `<p class="score-error" role="alert">${issue}</p>` : ''}
    ${issue && draft.method === 'array' ? '<button type="button" class="button secondary" id="reset-array" data-score-action>Restaurar conjunto padrão</button>' : ''}
    ${draft.method !== 'manual' || draft.abilityBatch ? '<button type="button" class="button secondary icon-label" id="suggest-scores" data-score-action>Distribuir por prioridade</button>' : ''}
    ${draft.method === 'manual' ? rollControls() : ''}
    <div class="scores attribute-scores">${abilities
      .map(([id, , label]) => {
        const repeated =
          draft.method === 'array' &&
          scores.filter((value) => value === draft.scores[id]).length > 1;
        return `<div data-ability="${id}" data-builder-key="score:${id}" class="${repeated ? 'score-repeated' : ''}">
      <div class="builder-score-heading"><span class="score-label icon-label" id="score-label-${id}">${gameIcon(abilityEmblems[id])}${label}</span>
        <span class="tag public-tag" title="Modificador final">${plus(modifier(projection.scores[id]))}</span></div>
      <div class="builder-score-controls">
        ${scoreControl(id, label)}
      </div>
      <div class="builder-score-final"><small>Valor final</small><strong class="builder-score-value">${projection.scores[id]}</strong></div></div>`;
      })
      .join('')}</div>`;
}

let progressionLevel;

function progression() {
  const groups = projection.groups.filter(({ section }) => section === 'progressao');
  const plan = classPlan(draft);
  const requirements = progressionRequirements(draft, projection);
  const active = Math.min(progressionLevel ?? plan.length, plan.length);
  const index = active - 1;
  const current = plan[index];
  const track = projection.classes.find(({ entry }) => entry.id === current);
  const lastClass = classEntry(plan.at(-1));
  const choices = groups.filter(({ characterLevel }) => characterLevel === active);
  const spells = choices.filter(({ spellPicker }) => spellPicker);
  const requiredSpells = spells.filter(({ optional }) => !optional);
  const spellCount = requiredSpells.reduce((sum, { count }) => sum + count, 0);
  const selectedSpells = requiredSpells.reduce((sum, { selected }) => sum + selected.length, 0);
  const startingSpellGroup = requiredSpells.find(({ selected, count }) => selected.length < count) ?? spells[0];
  const required = choices.filter(({ optional, spellPicker }) => !optional && !spellPicker);
  const optional = choices.filter(({ optional, spellPicker, options }) => optional && !spellPicker && options.length);
  return `<div class="progression-header">
      <div><h2>Classe e níveis</h2><div class="entry-tags"><span class="tag">Nível total ${plan.length}</span>
        ${projection.classes.map(({ entry, levels }) => `<span class="tag public-tag"${catalogTheme('classes', entry)}>${escape(displayName(entry))} ${levels.length}</span>`).join('')}
      </div></div>
      ${lastClass && plan.length < 20 && plan.every(Boolean) ? `<div class="score-actions">
        <button type="button" class="button primary icon-label" data-advance-level>${gameIcon(classEmblemId(lastClass.id))} Subir nível em ${escape(displayName(lastClass))}</button>
        <button type="button" class="button secondary" id="picker:class-level/${plan.length}" data-picker="class-level/${plan.length}" aria-haspopup="dialog">Avançar em outra classe</button></div>` : ''}
    </div>
    ${requirements.length ? `<p class="score-error" role="alert">${escape(requirements.join('. '))}.</p>` : ''}
    <nav class="progression-levels" aria-label="Níveis do personagem">${plan.map((id, position) => {
      const level = position + 1;
      const cls = classEntry(id);
      const pending = groups.filter((group) => group.characterLevel === level && projection.pending.includes(group.key)).length;
      return `<button type="button" class="button secondary level-heading" data-open-level="${level}" aria-pressed="${level === active}"${cls ? catalogTheme('classes', cls) : ''}>
        <strong>Nível ${level}</strong><small>${cls ? escape(displayName(cls)) : 'Escolher classe'}</small>
        ${pending ? `<span class="tag" aria-label="${pending} pendências">${pending}</span>` : ''}
      </button>`;
    }).join('')}</nav>
    <section class="level progression-level" data-builder-key="level:${active}"${track ? catalogTheme('classes', track.entry) : ''}>
      <div class="progression-level-header"><h3 class="icon-label">${track ? catalogEmblem('classes', track.entry) : ''} Nível ${active}${track ? ` · ${escape(displayName(track.entry))} ${track.levels.indexOf(active) + 1}` : ''}</h3>
        <div class="score-actions"><button type="button" class="button ${current ? 'secondary' : 'primary'}"
          id="picker:class-level/${index}" data-picker="class-level/${index}" aria-haspopup="dialog">${current ? 'Trocar classe' : 'Escolher classe'}</button>
        ${active === plan.length && active > 1 ? '<button type="button" class="button secondary" data-remove-level>Remover último nível</button>' : ''}</div>
      </div>
      ${current === 'warlock' && choices.some(({ key }) => key.includes('/invocation/'))
        ? '<p class="muted">A partir do 2º nível de Bruxo, escolha um truque elegível para invocações como Rajada Agonizante.</p>' : ''}
      <div class="builder-choices">
        ${startingSpellGroup ? `<section class="choice builder-choice-card builder-spell-choice"><h3>Magias do nível</h3>
          <div class="builder-choice-meta"><small>${spells.length} ${spells.length === 1 ? 'lista' : 'listas'}</small>
            ${spellCount ? `<span class="tag" data-choice-complete="${selectedSpells === spellCount}">${selectedSpells} de ${spellCount}</span>` : ''}</div>
          <button class="button secondary icon-label" type="button" id="picker:${escape(startingSpellGroup.key)}"
            data-picker="${escape(startingSpellGroup.key)}" data-spell-group-level="${active}" aria-haspopup="dialog">${gameIcon('class-wand')} Escolher ou revisar magias</button>
        </section>` : ''}
        ${required.map(choiceBlock).join('')}</div>
      ${optional.length ? `<details class="entry"><summary>Escolhas opcionais deste nível</summary>
        <div class="builder-choices progression-optional">${optional.map(choiceBlock).join('')}</div></details>` : ''}
    </section>
    ${projection.features.some(({ section }) => section === 'progressao') ? `<details class="entry"><summary>Características de classe</summary>${benefits('progressao')}</details>` : ''}`;
}

function missingChoices() {
  return characterIssues(draft, projection, catalog);
}

function sheetRollTarget(action, id, label, bonus) {
  return `<button class="sheet-roll-target" type="button" data-play="${action}" data-check="${escape(id)}"
    aria-label="Rolar ${escape(label)} (${plus(bonus)})"></button>`;
}

function skillPanel(skills, playable = false) {
  return `<section class="hub-skills"><h3>Perícias</h3><dl>${skills.map(({ id, name, ability, bonus, proficient, expertise, disadvantage }) =>
    `<div ${playable ? 'class="sheet-roll-card"' : ''} data-ability="${escape(ability)}"><dt>${proficient || expertise ? `<span class="hub-proficient" title="${expertise ? 'Especialização' : 'Proficiente'}">●</span>` : ''}${escape(name)}${disadvantage ? ' <small>· Desvantagem</small>' : ''}</dt>
    <dd>${plus(bonus)}${playable ? sheetRollTarget('skill', id, name, bonus) : ''}</dd></div>`
  ).join('')}</dl></section>`;
}

function review(pending = missingChoices()) {
  return `<h2>Revisão</h2>
    ${
      pending.length
        ? `<p>Há ${pending.length} escolhas pendentes.</p><ul class="pending">
      ${pending.map(([section, label]) => `<li><a class="navigation-row" href="${link(section)}">${gameIcon('feat-alert', 'game-emblem')}<span>${escape(label)}</span><span aria-hidden="true">›</span></a></li>`).join('')}</ul>`
        : '<p>As escolhas disponíveis no construtor estão preenchidas.</p>'
    }
    <p class="muted">Confira também as escolhas e condições descritas no texto das habilidades.</p>
    <div class="builder-review-grid">${facts(true)}${skillPanel(deriveCharacter(draft, projection, catalog).skills)}</div>`;
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
  cancelAnimationFrame(diceAnimation);
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
    `<article class="dice-result">
      <div class="dice-result-heading"><h3>${escape(label)}</h3><strong class="dice-total" aria-label="Total: ${total}">${total}</strong></div>
      <details class="dice-calculation"><summary>Ver cálculo</summary>
        <p>${dice.join(' + ')}${bonus ? ' ' + plus(bonus) : ''}${discarded ? ` · descarta ${discarded}` : ''} = <strong>${total}</strong></p>
      </details>
    </article>`
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
  if (!pieces.length) return reveal();
  diceBoard.innerHTML = pieces.map(({ value, sides, dropped }) =>
    `<span class="board-die${dropped ? ' discarded-die' : ''}">${renderDie(value, sides)}</span>`
  ).join('');
  diceBoard.hidden = false;
  const dice = [...diceBoard.children].map((element, index) => {
    const radius = element.offsetWidth / 2;
    const direction = index % 2 ? -1 : 1;
    const width = diceBoard.clientWidth;
    const height = diceBoard.clientHeight;
    const lane = Math.floor(index / 2);
    const lanes = Math.max(1, Math.ceil(pieces.length / 2));
    return {
      element, radius, angle: 0,
      spin: direction * (480 + Math.random() * 300),
      x: direction > 0 ? radius + 18 : width - radius - 18,
      y: height * (0.12 + 0.76 * (lane + 0.5) / lanes),
      vx: direction * width * (2.25 + Math.random() * 0.45),
      vy: (height / 2 - height * (0.12 + 0.76 * (lane + 0.5) / lanes)) * 1.35 + (Math.random() - 0.5) * 220,
    };
  });
  const start = performance.now();
  let previous = start;
  const advance = (dt, width, height) => {
    const friction = Math.exp(-2.15 * dt);
    for (const die of dice) {
      die.x += die.vx * dt;
      die.y += die.vy * dt;
      die.vx *= friction;
      die.vy *= friction;
      die.angle += die.spin * dt;
      die.spin *= friction;
    }
    for (const [index, a] of dice.entries()) {
      for (let j = index + 1; j < dice.length; j++) {
        const b = dice[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const overlap = a.radius + b.radius - distance;
        if (overlap <= 0) continue;
        const nx = distance ? dx / distance : 1;
        const ny = distance ? dy / distance : 0;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;
        const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (speed >= 0) continue;
        const impulse = -0.78 * speed;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        a.spin += impulse * ny * 0.5;
        b.spin -= impulse * ny * 0.5;
      }
    }
    for (const die of dice) {
      for (const [position, velocity, size] of [['x', 'vx', width], ['y', 'vy', height]]) {
        const edge = die.radius + 14;
        if (die[position] < edge) {
          die[position] = edge;
          die[velocity] = Math.abs(die[velocity]) * 0.72;
        } else if (die[position] > size - edge) {
          die[position] = size - edge;
          die[velocity] = -Math.abs(die[velocity]) * 0.72;
        }
      }
    }
  };
  const frame = (now) => {
    const dt = Math.min(0.022, (now - previous) / 1000);
    previous = now;
    const width = diceBoard.clientWidth;
    const height = diceBoard.clientHeight;
    advance(dt / 2, width, height);
    advance(dt / 2, width, height);
    for (const die of dice) {
      die.element.style.transform = `translate3d(${die.x - die.radius}px, ${die.y - die.radius}px, 0) rotate(${die.angle}deg)`;
    }
    if (now - start < 1850) diceAnimation = requestAnimationFrame(frame);
    else reveal();
  };
  diceAnimation = requestAnimationFrame(frame);
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
      <div class="play-actions">${chipSelect('combat-skill', 'Perícia', calculated.skills.map(({ id, name, bonus, ability }) =>
        [id, `${name} ${plus(bonus)}`, false, `data-ability="${escape(ability)}"`]), { play: true })}
        <button type="button" class="button secondary" data-play="skill" data-combat-skill>Rolar perícia</button></div>
      ${castable.length ? `<div class="combat-casting">
        ${chipSelect('combat-spell', 'Magia rápida', castable.map(({ spell, index }) =>
          [String(index), spellName(spell), false, spellTheme(spell)]), { play: true })}
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
    ${options.length ? `<div class="spell-cast-row">${chipSelect('', 'Conjurar com', options.map(({ key, label }) => [key, label]), { play: true })}
    <button type="button" class="button primary" data-play="cast">Conjurar</button></div>` : `<span class="muted">${resources.armorUntrained ? 'A armadura sem treinamento impede a conjuração.' : 'Sem conjuração disponível.'}</span>`}
    ${rolls.map(({ label, type }, i) => `<button type="button" class="button secondary" data-play="spell-roll" data-roll-index="${i}">
      Rolar ${escape(label.toLowerCase())}${type ? ` · ${escape(type)}` : ''}</button>`).join('')}
  </div>`;
}

function castingSummary(calculated, resources) {
  if (!calculated.casting.length) return '';
  const slots = resources?.slots ?? [
    ...calculated.commonSlots,
    ...calculated.casting.filter(({ pact }) => pact)
      .flatMap(({ slots }) => (slots ?? []).map((slot) => ({ ...slot, pact: true }))),
  ];
  return `<section class="casting-summary"><h3>Conjuração</h3>
    <div class="casting-casters">${calculated.casting.map(({ id, name, ability, saveDC, attack }) => `
      <div class="casting-caster">
        <strong class="tag public-tag" data-class-theme="${escape(id)}">${gameIcon(classEmblemId(id))}${escape(name)}</strong>
        <span class="tag public-tag" data-ability="${escape(ability)}">${gameIcon(abilityEmblems[ability])}${escape(abilityLabel(ability))}</span>
        <span class="tag" title="Classe de Dificuldade">${gameIcon('shield')} CD <strong>${saveDC}</strong></span>
        <span class="tag">${gameIcon('class-wand')} Ataque <strong>${plus(attack)}</strong></span>
      </div>`).join('')}</div>
    ${[
      [false, 'Espaços de magia', 'Descanso longo'],
      [true, 'Espaços de pacto', 'Descanso curto ou longo'],
    ].map(([pact, label, rest]) => {
      const group = slots.filter((slot) => Boolean(slot.pact) === pact && slot.maximum > 0);
      if (!group.length) return '';
      return `<section class="casting-slots"><h4>${label} <small>${rest}</small></h4>
        <ul>${group.map(({ level, maximum, remaining }) => `<li data-spell-circle="${level}">
          <span class="casting-slot-label">${spellCircle(level)}</span>
          <span class="casting-slot-pips" aria-hidden="true">${Array.from({ length: maximum }, (_, i) =>
            `<span class="${i < (remaining ?? maximum) ? 'available' : ''}"></span>`).join('')}</span>
          <small>${remaining == null ? `${maximum} ${maximum === 1 ? 'espaço' : 'espaços'}` : `${remaining}/${maximum} disponíveis`}</small>
        </li>`).join('')}</ul></section>`;
    }).join('')}
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
            `<article class="inventory-item${playable ? ' sheet-inventory-item' : ''}">
    ${(editable || playable) && equipmentSlot(row) ? `<button class="button secondary inventory-equip" type="button"
      data-equip-item="${escape(row.id)}" aria-label="${row.equipped ? 'Desequipar' : 'Equipar'} ${escape(row.name)}">${row.equipped ? 'Desequipar' : 'Equipar'}</button>` : ''}
    <details class="entry"><summary>${playable ? `<strong class="icon-label">${catalogEmblem('items', row.item ?? { id: '' })}${escape(row.name)}</strong>
      <span class="entry-tags"><span class="tag">${escape(row.quantity)}×</span>
      ${row.base ? `<span class="tag">${escape(displayName(row.base))}</span>` : ''}
      ${row.equipped ? '<span class="tag inventory-status">Equipado</span>' : ''}
      ${row.attuned ? '<span class="tag inventory-status">Sintonizado</span>' : ''}</span>`
      : `${escape(row.quantity)}× ${escape(row.name)}
        ${row.base ? ' · ' + escape(displayName(row.base)) : ''}
        ${row.equipped ? ' · equipado' : ''}${row.attuned ? ' · sintonizado' : ''}`}</summary>
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

function sheetSpellCard(spell, index) {
  return `<button class="navigation-row wiki-result public-spell-card" type="button" data-sheet-spell="${index}"
    aria-haspopup="dialog"${spellTheme(spell)}>${spellIcon(spell)}
    <span class="wiki-result-content grid grid-cols-1 gap-[0.22rem]"><strong>${escape(spellName(spell))}</strong>
      <span class="entry-tags">${spellTagMarkup(spell)}</span>
    </span><span aria-hidden="true">›</span></button>`;
}

function openSheetSpell(index) {
  const spell = projection.spells[index];
  if (!spell) return;
  const calculated = deriveCharacter(draft, projection, catalog);
  const ready = withSpellAbility(spell, calculated);
  publicSpellDialog.innerHTML = `<section${spellTheme(ready)}>
    <header class="public-spell-heading">
      ${spellIcon(ready)}
      <div class="public-spell-title-group">
        <h2 id="public-spell-title">${escape(spellName(ready))}</h2>
        <div class="entry-tags">${spellTagMarkup(ready)}</div>
      </div>
      <form method="dialog"><button class="public-feature-link" autofocus>Fechar</button></form>
    </header>
    ${ready.grantedBy ? `<p class="muted">Concedida por ${escape(ready.grantedBy)}</p>` : ''}
    ${publicSheet ? '' : `<div class="sheet-spell-controls">${spellPlayActions(ready, index, playResources(draft, calculated))}</div>`}
    ${spellDescription(ready)}
    ${publicSheet ? `<div class="public-spell-links"><a class="public-feature-link" href="${compendiumHref('magias', ready.id)}">Ver no compêndio <span aria-hidden="true">›</span></a></div>` : ''}
  </section>`;
  publicSpellDialog.showModal();
}

function sheet() {
  const calculated = deriveCharacter(draft, projection, catalog);
  const playable = draft.saved && !publicSheet;
  const resources = playable && playResources(draft, calculated);
  const scores = abilities
    .map(
      ([id, , name]) => `<div ${playable ? 'class="sheet-roll-card"' : ''} data-ability="${id}"><dt class="icon-label">${gameIcon(abilityEmblems[id])}${name}</dt><dd>${projection.scores[id]}
    <small>${plus(calculated.modifiers[id])}</small>${playable ? sheetRollTarget('ability', id, `teste de ${name}`, calculated.modifiers[id]) : ''}</dd></div>`
    )
    .join('');
  const choices = projection.groups.filter(({ selected }) => selected.length);
  const panel = (id, content) => playable
    ? `<section class="session-pane" data-sheet-pane="${id}" aria-label="${sheetTabs.find(([key]) => key === id)[1]}" ${sheetTab !== id ? 'hidden' : ''}>${content}</section>`
    : content;
  const vitals = `<dl class="facts sheet-vitals">${[
    ['PV máximos', calculated.maximumHP, 'ability-heart'],
    ['Classe de Armadura', calculated.armorClass, 'shield', calculated.armorSource],
    ['Iniciativa', plus(calculated.initiative), 'ability-boot'],
    ['Deslocamento', `${calculated.speed} pés`, 'ability-boot'],
    ['Percepção passiva', calculated.passivePerception, 'divination'],
    ['Proficiência', plus(calculated.proficiency), 'feat-skilled'],
    ['Dados de Vida', calculated.hitDice.join(' + '), 'ability-heart'],
  ].map(([label, value, icon, note]) => `<div><dt class="icon-label">${gameIcon(icon)}${label}</dt>
    <dd>${escape(value)}${note ? `<small>${escape(note)}</small>` : ''}</dd></div>`).join('')}</dl>`;
  const defenses = [
    ['Resistências a dano', calculated.resistances],
    ['Imunidades a dano', calculated.damageImmunities],
  ].filter(([, types]) => types.length);
  const damageDefenses = defenses.length ? `<dl class="facts sheet-defenses">${defenses.map(([label, types]) =>
    `<div><dt>${label}</dt><dd class="public-tags">${types.map((type) => damageTag(type, damageTypeLabel(type))).join('')}</dd></div>`
  ).join('')}</dl>` : '';
  const saves = `<section class="sheet-saving-throws"><h3>Testes de resistência</h3><dl class="facts">${calculated.savingThrows.map(
    ({ id, name, bonus, proficient }) => `<div ${playable ? 'class="sheet-roll-card"' : ''} data-ability="${id}"><dt>${name}</dt><dd>
      ${plus(bonus)}${proficient ? '<small class="tag">Proficiente</small>' : ''}${playable ? sheetRollTarget('save', id, `resistência de ${name}`, bonus) : ''}</dd></div>`
  ).join('')}</dl></section>`;
  const overview = `<div class="public-overview">${vitals}${damageDefenses}
      <div class="public-checks"><section class="public-attributes"><h3>Atributos</h3>
        <dl class="scores sheet-scores">${scores}</dl>${saves}</section>${skillPanel(calculated.skills, playable)}</div>
    </div>`;
  return `
    ${playable ? panel('combate', `
      <div class="session-combat-stats">
        <span class="icon-label">${gameIcon('shield')} CA <strong>${calculated.armorClass}</strong></span>
        <span class="icon-label">${gameIcon('feat-alert')} Iniciativa <strong>${plus(calculated.initiative)}</strong></span>
        <span class="icon-label">${gameIcon('ability-boot')} Deslocamento <strong>${calculated.speed} pés</strong></span>
        <span class="icon-label">${gameIcon('divination')} Percepção passiva <strong>${calculated.passivePerception}</strong></span>
      </div>
      ${playPanel(calculated)}
    `) : ''}
    ${panel('testes', overview)}
    ${panel('habilidades', `<div class="session-reference"><section>${facts(true)}</section><div>
    ${benefits()}
    ${projection.feats.length ? `<section class="benefits"><h3>Talentos</h3>${publicSheet
      ? `<div class="public-feats">${projection.feats.map((entry) => {
        const feat = catalog.byFeat.get(entry.id);
        return feat ? articleLink('feats', feat) : details(entry);
      }).join('')}</div>`
      : projection.feats.map((entry) => details(entry)).join('')}</section>` : ''}
    ${projection.selectedFeatures.length ? `<section class="benefits"><h3>Opções aprendidas e benefícios das escolhas</h3>${projection.selectedFeatures.map((entry) => details(entry)).join('')}</section>` : ''}
    ${choices.length
      ? `<details class="entry"><summary><strong>Escolhas registradas</strong></summary><ul class="pending">
      ${choices.map((group) => `<li>${escape(group.name)} · ${escape(group.selected.map((id) => displayName(group.options.find((option) => option.id === id))).join(', '))}</li>`).join('')}
      </ul></details>`
      : ''}</div></div>`)}
    ${panel('magias', `<div class="session-magic">${castingSummary(calculated, resources)}
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
              if (!spells.length) return '';
              const levels = [...new Set(spells.map(({ spell }) => spell.level))].sort((a, b) => a - b);
              return `<h4${mode === 'cantrip' ? ' class="casting-circle-heading" data-spell-circle="0"' : ''}>${title}</h4>
                  ${levels.map((level) => `${mode === 'cantrip' ? '' : `<h5 class="casting-circle-heading" data-spell-circle="${level}">${spellCircle(level)}</h5>`}
                    <div class="session-inventory">${spells.filter(({ spell }) => spell.level === level)
                      .map(({ spell, index }) => sheetSpellCard(spell, index)).join('')}</div>`).join('')}`;
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
      <p>${draft.cloudPublic ? `<a href="#publica/${draft.id}">Abrir link público</a>` : 'Acesso restrito à sua conta'}</p>
    </section>`
        : !publicSheet ? '<section><h3>Compartilhamento</h3><p>Entre na sua conta para publicar fichas salvas nela.</p></section>' : ''
    }
    ${!publicSheet && characterSync?.conflicts.has(draft.id) ? '<p>Esta edição conflita com outra versão da conta.</p><button type="button" class="button secondary" data-copy-conflict>Salvar esta edição como nova ficha</button><button type="button" class="button secondary" data-reload-character>Usar versão da conta</button>' : ''}</div></div>`) }`;
}

function sessionSheet() {
  projection = projectCharacter(draft, catalog);
  const feedback = publicationFeedback?.id === draft.id ? publicationFeedback : undefined;
  return `<header class="session-header">
    <div><h1 class="icon-label">${characterEmblem(projection.classes)}${escape(title(draft))}</h1>
      ${publicCharacterTags(projection.classes, classPlan(draft).length, projection.species)}
    </div>
    <div class="hub-actions"><a class="button secondary" href="#personagens">Meus personagens</a>
      <a class="button secondary" href="${link('origem')}">Editar ficha</a>
      ${user && !draft.cloudModeration ? `<button type="button" class="button ${draft.cloudPublic ? 'secondary' : 'primary'}" data-publish>${draft.cloudPublic ? 'Tornar privada' : 'Publicar ficha'}</button>` : ''}
      ${draft.cloudPublic && user ? `<a class="button secondary" href="#publica/${escape(draft.id)}">Ver ficha pública</a>` : ''}</div>
    ${user && draft.cloudModeration ? `<details class="publication-feedback">
      <summary>Publicação bloqueada · Ver aviso</summary>
      <p class="moderation-text">${escape(draft.cloudModeration.message ?? 'A administração bloqueou a publicação desta ficha.')}</p>
      ${draft.cloudModeration.appeal ? `<p>Pedido enviado</p><p class="moderation-text">${escape(draft.cloudModeration.appeal)}</p>` : `
        <form data-sheet-appeal class="moderation-form">
          <label for="sheet-appeal">Pedido de revisão</label>
          <textarea id="sheet-appeal" name="message" rows="3" maxlength="2000" required></textarea>
          <button class="button secondary" type="submit">Enviar pedido</button>
          <p role="alert"></p>
        </form>`}
    </details>` : ''}
    ${feedback ? `<div class="publication-feedback" role="${feedback.error ? 'alert' : 'status'}">
      ${escape(feedback.message)} ${feedback.review ? `<a href="${link('revisao')}">Abrir revisão</a>` : ''}
    </div>` : ''}
  </header>
  <nav class="session-tabs" aria-label="Seções da ficha">
    ${sheetTabs.map(([id, label]) => `<button class="button secondary" type="button"
      data-sheet-tab="${id}" aria-pressed="${id === sheetTab}">${label}</button>`).join('')}
  </nav>
  <form class="session-body" id="builder-form">${sheet()}</form>`;
}

function builder() {
  projection = projectCharacter(draft, catalog);
  const pending = missingChoices();
  const contents = {
    origem: origin,
    atributos: attributes,
    progressao: progression,
    equipamento: equipment,
    historia: narrative,
    revisao: () => review(pending),
  };
  const stepIndex = steps.findIndex(([id]) => id === step);
  const previous = steps[stepIndex - 1]?.[0];
  const next = steps[stepIndex + 1]?.[0];
  const stepIcons = ['origin-traveler', 'ability-heart', 'paladin', 'shield', 'origin-scribe', 'ability-book'];
  return `<header class="builder-header">
      <a class="button secondary builder-back" href="#personagens"><span aria-hidden="true">←</span> Meus personagens</a>
      <div class="builder-identity">${characterEmblem(projection.classes)}
        <div><h1>${escape(title(draft))}</h1><div class="entry-tags">
          <span class="tag">Nível total ${classPlan(draft).length}</span>
          <span class="tag">${draft.saved ? 'Ficha salva' : 'Rascunho'}</span>
        </div></div>
        ${draft.saved ? `<a class="button secondary icon-label" href="${sheetLink(draft.id)}">${gameIcon('ability-book')} Abrir ficha de jogo</a>` : ''}
      </div>
    </header>
    <nav class="panel steps" aria-label="Etapas do personagem">${steps.map(([id, label], index) => {
      const count = pending.filter(([section]) => section === id).length;
      return `<a href="${link(id)}" ${id === step ? 'aria-current="step"' : ''}>
        ${gameIcon(stepIcons[index], 'game-emblem')}<strong>${label}</strong>
        ${count ? `<small class="tag" aria-label="${count} pendências">${count}</small>` : ''}
      </a>`;
    }).join('')}</nav>
    <div class="layout">
      <form class="panel workspace" id="builder-form">
        <div class="builder-controls">
          ${previous ? `<a class="button secondary" href="${link(previous)}">← ${steps[stepIndex - 1][1]}</a>` : ''}
          ${next
          ? `<a class="button primary continue" href="${link(next)}">${steps[stepIndex + 1][1]} →</a>`
          : `<button type="submit" class="button primary" ${pending.length ? 'disabled' : ''}>Salvar ficha</button>`}</div>
        <div class="builder-fields" data-builder-step="${step}" tabindex="0" aria-label="Escolhas da etapa">${contents[step]()}</div>
      </form>
      <aside class="panel summary"><h2>Resumo</h2>
        <dl class="facts builder-summary-facts">
          ${[
            ['Espécie', 'species', projection.species],
            ['Antecedente', 'backgrounds', projection.background],
          ].map(([label, category, entry]) => `<div><dt>${label}</dt><dd>${entry
            ? `<span class="tag public-tag"${catalogTheme(category, entry)}>${catalogEmblem(category, entry)}${escape(displayName(entry))}</span>`
            : 'A escolher'}</dd></div>`).join('')}
          <div><dt>Classes</dt><dd>${projection.classes.length ? publicCharacterTags(projection.classes, classPlan(draft).length) : 'A escolher'}</dd></div>
        </dl>
        <a class="navigation-row builder-review-link" href="${link('revisao')}">
          ${gameIcon(pending.length ? 'feat-alert' : 'ability-book', 'game-emblem')}
          <span>${pending.length ? `${pending.length} ${pending.length === 1 ? 'escolha pendente' : 'escolhas pendentes'}` : 'Revisar ficha'}</span>
          <span aria-hidden="true">›</span>
        </a>
      </aside>
    </div>`;
}

function builderNodeKey(node) {
  return node.nodeType === Node.ELEMENT_NODE ? node.id || node.getAttribute('data-builder-key') : null;
}

function patchBuilderChildren(parent, nextParent) {
  let current = parent.firstChild;
  for (const next of nextParent.childNodes) {
    const key = builderNodeKey(next);
    const matches = (node) => node?.nodeName === next.nodeName && builderNodeKey(node) === key;
    let matching = current;
    while (matching && !matches(matching)) matching = matching.nextSibling;
    if (!matching) {
      parent.insertBefore(next.cloneNode(true), current);
      continue;
    }
    if (matching !== current) parent.insertBefore(matching, current);
    if (matching.nodeType === Node.ELEMENT_NODE) {
      for (const { name } of [...matching.attributes]) {
        if (name === 'open' && matching.localName === 'details') continue;
        if (!next.hasAttribute(name)) matching.removeAttribute(name);
      }
      for (const { name, value } of next.attributes) {
        if (matching.getAttribute(name) !== value) matching.setAttribute(name, value);
      }
      patchBuilderChildren(matching, next);
      if (matching instanceof HTMLInputElement && matching.checked !== next.checked) matching.checked = next.checked;
      if ((matching instanceof HTMLInputElement || matching instanceof HTMLSelectElement ||
          matching instanceof HTMLTextAreaElement) && matching.value !== next.value) matching.value = next.value;
    } else if (matching.nodeValue !== next.nodeValue) matching.nodeValue = next.nodeValue;
    current = matching.nextSibling;
  }
  while (current) {
    const child = current;
    current = child.nextSibling;
    child.remove();
  }
}

function renderBuilder() {
  const next = document.createElement('template');
  next.innerHTML = builder();
  patchBuilderChildren(main, next.content);
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
      ${user.role === 'admin' ? accountLink('#administracao', 'Painel de Administração', gameIcon('shield')) : ''}
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
    </form>
    <form class="account-settings-form" data-account-state>
      <h2>Gerenciar desativação e exclusão</h2>
      <p>Você pode reativar sua conta desativada entrando novamente em até 30 dias. Depois desse prazo, a conta e suas fichas no servidor são excluídas.</p>
      <label for="account-state-password">Senha atual</label>
      <input id="account-state-password" type="password" name="currentPassword" autocomplete="current-password" maxlength="128" required>
      <p role="alert"></p>
      <div class="admin-actions">
        <button class="button secondary" type="submit" value="deactivate">Desativar minha conta</button>
        <button class="button secondary" type="submit" value="delete">Excluir minha conta agora</button>
      </div>
    </form>` : ''}
    ${chipSelect('account-theme', 'Aparência', [
      ['', 'Usar tema do sistema'], ['light', 'Claro'], ['dark', 'Escuro'],
    ], { value: chosenTheme })}
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
  if (target.dataset.originBoost && !publicSheet) {
    updateOriginBoost(target);
    return;
  }
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
  if (publicSpellDialog.open) publicSpellDialog.close();
  menu();
  const [page, id, section] = location.hash.slice(1).split('/');
  if (!['personagem', 'ficha'].includes(page)) viewedCharacter = undefined;
  if (page !== 'galeria') {
    gallery = undefined;
    clearTimeout(gallerySearchTimer);
  }
  publicSheet = page === 'publica';
  if (!publicSheet) publicRecord = undefined;
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
  if (page === 'administracao') {
    draft = undefined;
    main.innerHTML = hubShell(page, user?.role === 'admin'
      ? adminView
      : '<section class="panel"><h1>Acesso restrito</h1><p>Esta área exige uma conta administrativa.</p></section>');
    const panel = main.querySelector('#admin-panel');
    if (panel) mountAdmin(panel, user.id);
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
        <article class="panel public-sheet">
          <header class="public-sheet-heading">
            ${characterEmblem(projection.classes)}
            <div><h1>${escape(title(draft))}</h1>
              ${publicCharacterTags(projection.classes, classPlan(draft).length, projection.species)}
            </div>
            ${publicAuthor(publicRecord)}
          </header>
          ${sheet()}
        </article>`;
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
    const opening = viewedCharacter !== accessKey(id);
    if (opening) progressionLevel = undefined;
    markOpened(id);
    if (draft.saved && (page === 'ficha' || section === 'ficha')) {
      if (page !== 'ficha') history.replaceState(null, '', sheetLink(id));
      if (sessionId !== id) sheetTab = 'combate';
      sessionId = id;
      step = 'ficha';
      main.classList.add('session-screen');
      main.innerHTML = sessionSheet();
      if (opening && user && draft.cloudVersion) void refreshSheetModeration(id, user.id).catch(() => {});
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
      catalogFilters = {};
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

function loginModeration(form, moderation) {
  const panel = form.querySelector('[data-login-moderation]');
  panel.hidden = !moderation;
  if (!moderation) {
    panel.replaceChildren();
    return;
  }
  const expires = moderation.expires && new Date(moderation.expires).toLocaleDateString('pt-BR');
  panel.innerHTML = `<div class="moderation-form">
    ${moderation.message ? `<p class="moderation-text">${escape(moderation.message)}</p>` : ''}
    ${expires ? `<p>Prazo para reativação pela administração até ${escape(expires)}.</p>` : ''}
    ${moderation.appeal ? `<p>Pedido de revisão enviado.</p><p class="moderation-text">${escape(moderation.appeal)}</p>` : `
      <label for="login-appeal">Pedido de revisão</label>
      <textarea id="login-appeal" name="appeal" rows="3" maxlength="2000" placeholder="Explique por que pede a reversão"></textarea>
      <button class="button secondary" type="submit" value="appeal">Enviar pedido</button>`}
    <button class="button secondary" type="submit" value="delete">Excluir minha conta agora</button>
  </div>`;
}

async function submitAccountState(form, trigger) {
  const action = trigger?.value;
  if (accountBusy || !['deactivate', 'delete'].includes(action)) return;
  const deleting = action === 'delete';
  if (!window.confirm(deleting
    ? 'Excluir definitivamente sua conta e suas fichas do servidor?'
    : 'Desativar sua conta? Entre novamente em até 30 dias para reativá-la.')) return;
  const owner = user?.id;
  const message = form.querySelector('[role="alert"]');
  accountBusy = true;
  trigger.disabled = true;
  message.textContent = '';
  try {
    const send = () => withSessionLock(() => authRequest('account-state', {
      action, currentPassword: form.elements.currentPassword.value,
    }));
    await send().catch(async (error) => {
      if (error.status !== 401) throw error;
      if ((await restoreSession())?.id !== owner) throw new Error('Sua sessão expirou. Entre novamente.');
      return send();
    });
    ++accountSync;
    setUser(null);
    setGuestMode(false);
    accounts?.postMessage('changed');
    openHash('#login');
    showNotice(deleting ? 'Conta excluída.' : 'Conta desativada. Entre novamente em até 30 dias para reativá-la.');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    accountBusy = false;
    trigger.disabled = false;
  }
}

function applySheetModeration(id, owner, moderation, isPublic) {
  const character = user?.id === owner && read(id);
  if (!character) return;
  const changed = JSON.stringify(character.cloudModeration ?? null) !== JSON.stringify(moderation ?? null)
    || Boolean(character.cloudPublic) !== Boolean(isPublic);
  if (!changed) return;
  cacheCharacter({ ...character, cloudModeration: moderation, cloudPublic: isPublic });
  if (draft?.id === id && step === 'ficha' && !publicSheet) renderPlay();
}

async function refreshSheetModeration(id, owner) {
  const record = await characterRequest('/' + id, {}, true, owner);
  applySheetModeration(id, owner, record.moderation, record.isPublic);
}

async function submitSheetAppeal(form) {
  const message = form.elements.message.value.trim();
  const feedback = form.querySelector('[role="alert"]');
  if (!message) {
    feedback.textContent = 'Escreva seu pedido de revisão.';
    return;
  }
  const id = draft.id;
  const owner = user.id;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const result = await characterRequest('/' + id + '/appeal', {
      method: 'POST', body: JSON.stringify({ message }),
    }, true, owner);
    applySheetModeration(id, owner, result.moderation, false);
    showNotice('Pedido de revisão enviado.');
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function submitAccount(form, trigger) {
  if (accountBusy) return;
  const view = form.dataset.view;
  const fields = new FormData(form);
  const email = fields.get('email')?.trim();
  const password = fields.get('password');
  const confirmation = fields.get('confirmation');
  const username = fields.get('username')?.trim();
  const action = trigger?.value;
  const appeal = action === 'appeal' ? fields.get('appeal')?.trim() : undefined;
  const deleteAccount = action === 'delete';
  const message = form.querySelector('#account-error');
  const submit = form.querySelector('button[type="submit"]');
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (action === 'appeal' && !appeal) {
    message.textContent = 'Escreva seu pedido de revisão.';
    form.elements.appeal.focus();
    return;
  }
  if (deleteAccount && !window.confirm('Excluir definitivamente sua conta e suas fichas do servidor?')) return;
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
      const session = await withSessionLock(() => authRequest('login', {
        email, password, appeal, ...(deleteAccount ? { deleteAccount: true } : {}),
      }));
      if (session.accountDeleted) {
        form.reset();
        loginModeration(form, null);
        showNotice('Conta excluída.');
        return;
      }
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
    if (view === 'login') loginModeration(form, error.moderation);
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
    const id = name.slice(6);
    const value = Number(field.value);
    if (draft.method === 'array') {
      const occupied = abilities.find(([other]) => other !== id && draft.scores[other] === value)?.[0];
      if (occupied) draft.scores[occupied] = draft.scores[id];
    }
    draft.scores[id] = value;
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
  } else if (button.id === 'suggest-scores') {
    const primary = projection.classes[0]?.entry.primaryAbility ?? [];
    const order = [...new Set([
      ...primary.map((name) => abilities.find(([, english]) => english === name)?.[0]).filter(Boolean),
      ...(primary.length ? ['con'] : []),
      ...abilities.map(([id]) => id),
    ])];
    if (draft.abilityBatch) {
      const ordered = draft.abilityBatch.rolls.map(({ score }, index) => ({ score, index }))
        .sort((a, b) => b.score - a.score);
      draft.abilityBatch.assignments = Object.fromEntries(order.map((id, index) => [id, ordered[index].index]));
    } else {
      draft.scores = Object.fromEntries(order.map((id, index) => [id, Object.values(standardScores)[index]]));
    }
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
  if (skill) setChipValue(document.getElementById('combat-skill'), skill);
  const spellSelect = document.getElementById('combat-spell');
  if (spellSelect && [...spellSelect.options].some(({ value }) => value === quickSpell)) {
    setChipValue(spellSelect, quickSpell);
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
    if (publicSpellDialog.contains(button)) publicSpellDialog.close();
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
    if (publicSpellDialog.contains(button) && publicSpellDialog.open) publicSpellDialog.close();
    const label = `${spellName(spell)} · ${roll.label}${roll.type ? ' · ' + roll.type : ''}`;
    showDice(Array.from({ length: roll.repeat ?? 1 }, (_, i) => ({
      ...rollDice(roll.count, roll.sides, roll.bonus),
      label: roll.repeat > 1 ? `${label} ${i + 1}` : label,
    })));
  } else if (action === 'cast') showNotice(`${spellName(spell)} conjurada.`);
}

publicSpellDialog.addEventListener('click', ({ target }) => {
  if (publicSheet) return;
  const chip = target.closest('[data-chip-value]');
  if (chip) chooseChip(chip);
  const action = target.closest('button[data-play]');
  if (action) playAction(action);
});

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
    ? entryDescription(option, true, true) + entryDescription(entry, true, true)
    : entryDescription(entry, true, true);
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
          entry.featChoices?.map(({ pick, category }) =>
            `Escolha ${pick} ${pick === 1 ? 'talento' : 'talentos'}${category && featCategories[category] ? ` · ${featCategories[category]}` : ''}`
          ).join(' / ') ||
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
      ${backgroundFeats.map(({ feat, note }) => `<details class="entry background-feat"${catalogTheme('feats', feat)}>
        <summary><strong class="icon-label">${catalogEmblem('feats', feat)}${escape(displayName(feat))}${note ? ` · ${escape(classLabel(note))}` : ''}</strong></summary>
        ${entryDescription(feat, true, true)}</details>`).join('')}
    </section>` : ''}
    ${backgroundFeatChoices.map(({ count, options }) => `<section class="benefits">
      <h4>Talentos à escolha (${escape(count)})</h4>
      ${options.map((feat) => details(feat, true, true)).join('')}
    </section>`).join('')}
    ${referenceDetails(entry, true)}
    ${wiki ? wikiBenefits(entry) : fixedSpells.length ? `<p><strong>Magias concedidas.</strong> ${escape(fixedSpells.join(' · '))}</p>` : ''}
    ${features.length ? `<section class="benefits"><${wiki ? 'h3' : 'h4'}>Características e habilidades</${wiki ? 'h3' : 'h4'}>${features.map((feature) => details(feature)).join('')}</section>` : ''}
    ${entry.sections?.length ? `<section class="benefits"><${wiki ? 'h3' : 'h4'}>Referências</${wiki ? 'h3' : 'h4'}>${entry.sections.map((section) => details(section)).join('')}</section>` : ''}
    ${choices
      .map(
        (
          choice
        ) => `<section class="benefits"><${wiki ? 'h3' : 'h4'}>${escape(displayName(choice))}</${wiki ? 'h3' : 'h4'}>
      ${wiki && (choice.translation?.prompt || choice.prompt) ? `<p class="muted">${escape(choice.translation?.prompt ?? choice.prompt)}</p>` : ''}
      <div class="feature-references">${choice.options.map((option) => details(option)).join('\n')}</div></section>`
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
  const tabs = choiceDialog.querySelector('[data-picker-spell-groups]');
  if (tabs) {
    tabs.innerHTML = projection.groups.filter((entry) =>
      entry.spellPicker && entry.characterLevel === picker.spellGroupLevel
    ).map((entry) => `<button class="tag spell-filter-option" type="button" data-picker-spell-tab="${escape(entry.key)}"
      aria-pressed="${entry.key === picker.key}">${escape(entry.name)} · ${entry.selected.length}/${entry.count}</button>`).join('');
  }
  const search = choiceDialog.querySelector('#picker-search').value;
  const query = normalizeSearch(search.trim());
  const name = group.spellPicker ? spellName : displayName;
  const tags = group.readOnly ? (entry) => [entry.prereq?.text ?? 'Bruxo nível 1+'] : optionLabels;
  const category = (entry) => group.spellPicker ? 'magias' : optionCategory(entry);
  const emblem = (entry) => {
    const kind = category(entry);
    return entry.emblem && kind !== 'feats' && !group.spellPicker
      ? gameIcon(entry.emblem, 'game-emblem')
      : catalogEmblem(kind, entry);
  };
  const tagMarkup = (entry) => group.spellPicker
    ? spellTagMarkup(entry)
    : tags(entry).map((tag) => `<span class="tag">${escape(tag)}</span>`).join('');
  const matches = group.spellPicker
    ? filterSpells(group.options.map(({ id }) => catalog.bySpell.get(id)).filter(Boolean), {
        search,
        ...picker.spellFilters,
      }).sort((a, b) => a.level - b.level || name(a).localeCompare(name(b), 'pt-BR'))
    : group.options.filter((entry) => {
        const attributes = group.field === 'background' ? entry.abilityScores ?? [] : [];
        const skills = group.field === 'background' ? entry.skillsFixed ?? [] : [];
        const { ability, skill, publication } = picker.originFilters;
        return (!publication || entry.source === publication) &&
          (!ability || attributes.some((attribute) => abilities.find(([id]) => id === ability)?.[1] === attribute)) &&
          (!skill || skills.includes(skill)) &&
          normalizeSearch([name(entry), entry.name, ...tags(entry), ...attributes.map(abilityLabel), ...skills.map(skillName)].join(' ')).includes(query);
      });
  const active = matches.find(({ id }) => id === picker.active) ?? matches[0];
  picker.active = active?.id;
  const variants = active?.invocationName
    ? matches.filter((entry) => entry.invocationName === active.invocationName)
    : [];
  const invocationRows = new Map();
  for (const entry of matches) {
    const key = entry.invocationName ?? entry.id;
    if (!invocationRows.has(key) || entry.id === active?.id ||
        (group.selected.includes(entry.id) && invocationRows.get(key).id !== active?.id)) {
      invocationRows.set(key, entry);
    }
  }
  const list = choiceDialog.querySelector('.picker-list');
  const scroll = list.scrollTop;
  list.innerHTML = matches.length
    ? [...invocationRows.values()]
        .map((entry) => {
          const selected = group.selected.includes(entry.id);
          const preview = `<button class="picker-row" type="button"
    ${catalogTheme(category(entry), entry)} data-preview-option="${escape(entry.id)}" data-selected="${selected}" aria-pressed="${entry.id === active?.id}">
    <span class="picker-row-title"><strong class="icon-label">${emblem(entry)}${escape(entry.invocationName ?? name(entry))}</strong>
    ${selected ? `<span class="picker-selected"><span aria-hidden="true">✓</span> ${group.spellPicker ? 'Selecionada' : 'Em uso'}</span>` : ''}</span>
    <span class="picker-tags">${tagMarkup(entry)}</span></button>`;
          return group.spellPicker && !group.readOnly ? `<div class="picker-spell-row">${preview}
            <button class="button secondary picker-quick-select" type="button" data-toggle-option="${escape(entry.id)}"
              aria-label="${selected ? 'Remover' : 'Selecionar'} ${escape(name(entry))}"
              ${!selected && group.count > 1 && group.selected.length >= group.count ? 'disabled' : ''}>${selected ? '−' : '+'}</button></div>` : preview;
        })
        .join('')
    : '<p class="muted">Nenhuma opção corresponde à busca.</p>';
  list.scrollTop = scroll;
  choiceDialog.querySelector('.picker-count').textContent = group.readOnly
    ? `${matches.length} de ${group.options.length} invocações`
    : group.familiarChoice
      ? group.selected.length ? 'Forma registrada' : 'Nenhuma forma registrada'
    : group.optional
      ? `${group.selected.length} selecionadas · opcional`
      : `${group.selected.length} de ${group.count} selecionadas`;
  const selected = active && group.selected.includes(active.id);
  choiceDialog.querySelector('.picker-detail').innerHTML = active
    ? `
    <div class="picker-detail-header"${catalogTheme(category(active), active)}><div><h3 class="icon-label">${emblem(active)}<span>${escape(active.invocationName ?? name(active))}</span></h3>
      <div class="picker-tags">${tagMarkup(active)}</div></div>
      ${
        group.readOnly || variants.length
          ? ''
          : `<button type="button" class="button ${selected ? 'secondary' : 'primary'}" data-toggle-option="${escape(active.id)}"
        ${(selected && group.index !== undefined) || (!selected && group.count > 1 && group.selected.length >= group.count) ? 'disabled' : ''}>
        ${selected ? (group.index === undefined ? 'Remover' : 'Selecionada') : group.count === 1 && group.selected.length ? 'Trocar' : 'Selecionar'}${group.spellPicker ? ' magia' : ''}</button>`
      }
    </div>${variants.length ? `<fieldset class="spell-filter-group"><legend>Truque afetado</legend>
      <div class="spell-filter-options">${variants.map((entry) => `<button type="button" class="tag spell-filter-option"
        data-toggle-option="${escape(entry.id)}" aria-pressed="${group.selected.includes(entry.id)}">${escape(entry.cantripName)}</button>`).join('')}</div></fieldset>` : ''}
    ${group.spellPicker ? spellDescription(active) : optionDetails(active)}`
    : '<p class="muted">Altere a busca para ver os detalhes de uma opção.</p>';
}

function openPicker(key, spellGroupLevel) {
  picker = { key, spellGroupLevel, spellFilters: {}, originFilters: {} };
  const group = pickerGroup();
  if (!group) return;
  picker.active = group.selected[0];
  choiceDialog.innerHTML = `<header class="picker-header"><div>
    ${group.source ? `<p class="eyebrow">${escape(group.source)}</p>` : ''}<h2 id="choice-picker-title">${spellGroupLevel ? `Magias do nível ${spellGroupLevel}` : escape(group.name)}</h2>
    ${group.prompt ? `<p class="muted">${escape(group.prompt)}</p>` : ''}
    <p class="picker-count muted" aria-live="polite"></p></div>
    <button type="button" class="button secondary" data-close-picker>Concluir</button></header>
    ${spellGroupLevel ? '<nav class="spell-filter-options picker-spell-tabs" data-picker-spell-groups aria-label="Listas de magias deste nível"></nav>' : ''}
    <div class="picker-filters">
      <div><label for="picker-search">${group.readOnly ? 'Buscar invocação' : group.spellPicker ? 'Buscar magia' : 'Buscar opção'}</label><input type="search" id="picker-search" autofocus></div>
      ${group.spellPicker ? spellFilterControls(group.options.map(({ id }) => catalog.bySpell.get(id)).filter(Boolean)) : ''}
      ${group.field === 'background' ? filterControls([
        ['ability', 'Atributo', 'Todos', abilities.map(([id, , label]) => [id, label])],
        ['skill', 'Perícia', 'Todas', [...new Set(group.options.flatMap((entry) => entry.skillsFixed ?? []))]
          .map((id) => [id, skillName(id)]).sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))],
      ], picker.originFilters) : ''}
      ${group.field === 'species' ? filterControls([
        ['publication', 'Suplemento', 'Todos', [...new Set(group.options.map(({ source }) => source).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'pt-BR')).map((source) => [source, source])],
      ], picker.originFilters) : ''}
    </div>
    <div class="picker-body"><div class="picker-list" aria-label="Opções disponíveis"></div>
      <section class="picker-detail" aria-label="Detalhes da opção"></section></div>`;
  drawPicker();
  if (!choiceDialog.open) choiceDialog.showModal();
}

choiceDialog.addEventListener('input', ({ target }) => {
  if (target.id === 'picker-search') drawPicker();
});

choiceDialog.addEventListener('click', ({ target }) => {
  const tab = target.closest('[data-picker-spell-tab]');
  if (tab) {
    if (tab.dataset.pickerSpellTab !== picker.key) {
      openPicker(tab.dataset.pickerSpellTab, picker.spellGroupLevel);
      choiceDialog.querySelector('[data-picker-spell-tab][aria-pressed="true"]')?.focus();
    }
    return;
  }
  const filter = target.closest('[data-spell-filter]');
  if (filter) {
    applySpellFilter(filter, pickerGroup()?.field ? picker.originFilters : picker.spellFilters);
    drawPicker();
    return;
  }
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
  picker.active = id;
  persistChange();
  renderBuilder();
  drawPicker();
  (
    choiceDialog.querySelector(`[data-toggle-option="${CSS.escape(id)}"]:enabled`) ??
    choiceDialog.querySelector('.picker-detail [data-toggle-option]:enabled') ??
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
  const level = picker?.spellGroupLevel;
  picker = undefined;
  (level ? main.querySelector(`[data-spell-group-level="${level}"]`) : document.getElementById(`picker:${key}`))?.focus();
});

main.addEventListener('click', async ({ target }) => {
  const spell = target.closest('[data-sheet-spell]');
  if (spell) {
    openSheetSpell(Number(spell.dataset.sheetSpell));
    return;
  }
  if (publicSheet) return;
  const chip = target.closest('[data-chip-value]');
  if (chip) {
    chooseChip(chip);
    return;
  }
  const filter = target.closest('[data-spell-filter]');
  if (filter) {
    const galleryControls = filter.closest('[data-gallery-filters]');
    if (galleryControls) {
      applySpellFilter(filter, galleryFilters);
      if (filter.dataset.spellFilter === 'class') {
        const subclass = catalog.subclasses.find((entry) => entry.id === galleryFilters.subclass);
        if (galleryFilters.class && subclass?.class !== classEntry(galleryFilters.class)?.name) {
          galleryFilters.subclass = '';
        }
        galleryControls.innerHTML = galleryFilterControls();
        galleryControls.querySelector('[data-spell-filter="class"][aria-pressed="true"]')?.focus();
      }
      refreshGallerySearch();
      return;
    }
    applySpellFilter(filter, catalogCategory === 'magias' ? catalogSpellFilters : catalogFilters);
    catalogLimit = 24;
    document.querySelector('#compendium-results').innerHTML = compendiumResults();
    return;
  }
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
    const page = gallery?.page ?? 1;
    gallery = undefined;
    loadGallery(page);
    main.querySelector('#gallery-results').innerHTML = galleryResults(gallery);
    return;
  }
  if (target.closest('[data-clear-gallery]')) {
    gallerySearch = '';
    galleryFilters.class = '';
    galleryFilters.subclass = '';
    const search = main.querySelector('#gallery-search');
    search.value = '';
    main.querySelector('[data-gallery-filters]').innerHTML = galleryFilterControls();
    refreshGallerySearch();
    search.focus();
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
    const id = draft.id;
    const publishing = !draft.cloudPublic;
    const issues = publishing ? missingChoices() : [];
    if (publishing && (!draft.saved || issues.length)) {
      publicationFeedback = { id, error: true, review: true, message: issues[0]?.[1] ?? 'Salve a ficha antes de publicar.' };
      renderPlay();
      return;
    }
    const sync = characterSync;
    if (!sync) {
      publicationFeedback = { id, error: true, message: 'A conexão com sua conta ainda não está disponível.' };
      renderPlay();
      return;
    }
    if (publishing && JSON.stringify(draft.selected) !== JSON.stringify(projection.validSelections)) {
      draft.selected = projection.validSelections;
      write();
    }
    publicationFeedback = undefined;
    publication.disabled = true;
    try {
      await sync.setPublication(id, publishing);
      publicRecord = undefined;
      if (sync === characterSync && read(id)?.cloudPublic === publishing) {
        publicationFeedback = { id, message: publishing ? 'Ficha publicada.' : 'Ficha agora privada.' };
      }
    } catch (error) {
      publicationFeedback = { id, error: true, review: error.code === 'PUBLICATION_DENIED', message: error.message };
      if (error.status === 403 && error.code === 'PUBLICATION_DENIED')
        await refreshSheetModeration(id, sync.owner).catch(() => {});
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
  if (target.closest('[data-advance-level]')) {
    const plan = classPlan(draft);
    const current = plan.at(-1);
    if (plan.length >= 20 || !plan.every(Boolean) || !classEntry(current)) return;
    draft.classPlan = [...plan, current];
    progressionLevel = draft.classPlan.length;
    persistChange();
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
    openPicker(pickerButton.dataset.picker, Number(pickerButton.dataset.spellGroupLevel) || undefined);
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
  if (target.id === 'gallery-search') {
    gallerySearch = target.value;
    clearTimeout(gallerySearchTimer);
    gallerySearchTimer = setTimeout(refreshGallerySearch, 300);
    return;
  }
  if (target.id === 'character-search') {
    characterFilter = target.value;
    document.querySelector('#character-results').innerHTML = characterList(savedCharacters());
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
  if (target.dataset.inlineChoice && !publicSheet) {
    const group = pickerGroup(target.dataset.inlineChoice);
    if (!group?.options.some(({ id }) => id === target.value)) return;
    const selected = group.count === 1 ? (target.checked ? [target.value] : [])
      : target.checked ? [...group.selected, target.value] : group.selected.filter((id) => id !== target.value);
    if (selected.length > group.count) return;
    draft.selected[group.key] = selected;
    persistChange();
    renderBuilder();
    document.getElementById(target.id)?.focus({ preventScroll: true });
    return;
  }
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
  const control = document.getElementById(target.id);
  (control?.closest('.chip-select')?.querySelector('[aria-pressed="true"]') ?? control)?.focus({ preventScroll: true });
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
  if (event.target.matches('form[data-account-state], form[data-sheet-appeal]')) {
    event.preventDefault();
    if (event.target.hasAttribute('data-account-state')) void submitAccountState(event.target, event.submitter);
    else void submitSheetAppeal(event.target);
    return;
  }
  if (event.target.matches('form[data-account-update]')) {
    event.preventDefault();
    void submitAccountUpdate(event.target);
    return;
  }
  if (event.target.id === 'account-form') {
    event.preventDefault();
    void submitAccount(event.target, event.submitter);
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
  cancelAnimationFrame(diceAnimation);
  diceBoard.hidden = true;
  diceBoard.replaceChildren();
  if (dicePopup.open) dicePopup.close();
  route();
  if (main.classList.contains('builder-screen')) window.scrollTo(0, 0);
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
