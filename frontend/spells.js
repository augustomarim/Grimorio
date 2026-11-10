export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]
  );

export const normalizeSearch = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function formatDescription(value, glossary = false) {
  const render = glossary ? (text) => annotateTerms(text, escapeHtml) : escapeHtml;
  return String(value ?? '')
    .replace(/\[\[(?:[^|\[\]\n]+\|)?([^\[\]\n]+)\]\]/g, '$1')
    .split(/(\*\*\*?[^*\n]+\*\*\*?)/g)
    .map((part, index) =>
      index % 2 ? `<strong>${render(part.replace(/^\*+|\*+$/g, '').trim())}</strong>` : render(part)
    )
    .join('');
}
export const originalDescription = (name, body, glossary = false) =>
  `<details class="spell-original"><summary>Texto completo em inglês</summary>
    ${name ? `<p lang="en"><strong>${escapeHtml(name)}</strong></p>` : ''}
    <p class="description" lang="en">${formatDescription(body, glossary)}</p></details>`;
export const spellName = (spell) => spell.translation?.name ?? spell.name;
export const spellCircle = (level) => (level === 0 ? 'Truque' : `${level}º círculo`);

export const spellSchools = {
  Abjuration: 'Abjuração',
  Conjuration: 'Conjuração',
  Divination: 'Adivinhação',
  Enchantment: 'Encantamento',
  Evocation: 'Evocação',
  Illusion: 'Ilusão',
  Necromancy: 'Necromancia',
  Transmutation: 'Transmutação',
};
const damageTypes = {
  acid: 'ácido',
  bludgeoning: 'contundente',
  cold: 'frio',
  fire: 'fogo',
  force: 'energia',
  lightning: 'elétrico',
  necrotic: 'necrótico',
  piercing: 'perfurante',
  poison: 'veneno',
  psychic: 'psíquico',
  radiant: 'radiante',
  slashing: 'cortante',
  thunder: 'trovejante',
};
const attributes = {
  Strength: 'Força',
  Dexterity: 'Destreza',
  Constitution: 'Constituição',
  Intelligence: 'Inteligência',
  Wisdom: 'Sabedoria',
  Charisma: 'Carisma',
};
const types = Object.keys(damageTypes).join('|');
const typeList = `(?:${types})(?:(?:,? (?:or |and )?)(?:${types}))*`;
const dice = '\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?';
const typedDamage = new RegExp(`\\b(${dice}|\\d+)\\s+(${typeList})\\s+damage\\b`, 'gi');
const equalDamage = new RegExp(
  `\\b(${typeList}) damage (?:\\(your choice\\) )?equal to (${dice})( plus your spellcasting ability modifier)?`,
  'gi'
);
const chosenDamage = new RegExp(`\\b(${dice})\\s+damage of the chosen type\\b`, 'gi');
const listedTypes = new RegExp(`\\b(?:${types})\\b`, 'gi');
const baseSpellText = (spell) =>
  (spell.text ?? '').split(
    /\*\*(?:Cantrip Upgrade|Using a Higher-Level Spell Slot|At Higher Levels)\b/i
  )[0];
const translateTypes = (list) => (list.match(listedTypes) ?? []).map((type) => type.toLowerCase());
const elemental = ['acid', 'cold', 'fire', 'lightning', 'thunder'];
const otherDamage = {
  'animate-objects': ['bludgeoning'],
  'chromatic-orb': [...elemental, 'poison'],
  'conjure-elemental': ['lightning', 'thunder', 'fire', 'cold'],
  'conjure-minor-elementals': ['acid', 'cold', 'fire', 'lightning'],
  'delayed-blast-fireball': ['fire'],
  'elemental-weapon': elemental,
  etherealness: ['force'],
  'prismatic-spray': ['fire', 'acid', 'lightning', 'poison', 'cold'],
  'prismatic-wall': ['fire', 'acid', 'lightning', 'poison', 'cold'],
  shillelagh: ['force', 'weapon'],
  'sorcerous-burst': [...elemental, 'poison', 'psychic'],
  'swift-quiver': ['piercing'],
  'true-strike': ['radiant', 'weapon'],
};
const damageTypeLabels = { ...damageTypes, force: 'energia (força)', weapon: 'tipo da arma' };
export const damageTypeLabel = (type) => damageTypeLabels[type];
export const spellDamageTypes = (spell) => {
  const base = baseSpellText(spell);
  return [
    ...new Set([
      ...[...base.matchAll(typedDamage)].flatMap(([, , list]) => translateTypes(list)),
      ...[...base.matchAll(equalDamage)].flatMap(([, list]) => translateTypes(list)),
      ...(otherDamage[spell.id] ?? []),
    ]),
  ];
};

function translateMeasure(value) {
  const translated = value
    ?.toLowerCase()
    .replace(
      /action \(overgrowth\) or 8 hours \(enrichment\)/g,
      'ação (crescimento) ou 8 horas (enriquecimento)'
    )
    .replace(/\bbonus action\b/g, 'ação bônus')
    .replace(/\baction\b/g, 'ação')
    .replace(/\breaction\b/g, 'reação')
    .replace(/\bself\b/g, 'pessoal')
    .replace(/\btouch\b/g, 'toque')
    .replace(/\bsight\b/g, 'à vista')
    .replace(/\bunlimited\b/g, 'ilimitado')
    .replace(/\bspecial\b/g, 'especial')
    .replace(/\bup to\b/g, 'até')
    .replace(/\binstantan(?:eous|ous)\b/g, 'instantânea')
    .replace(/\buntil dispelled or triggered\b/g, 'até ser dissipada ou acionada')
    .replace(/\buntil dispelled\b/g, 'até ser dissipada')
    .replace(/\bfeet\b/g, 'pés')
    .replace(/\bmiles?\b/g, (unit) => (unit === 'mile' ? 'milha' : 'milhas'))
    .replace(
      /\b(minutes?|hours?|days?|rounds?)\b/g,
      (unit) =>
        ({
          minute: 'minuto',
          minutes: 'minutos',
          hour: 'hora',
          hours: 'horas',
          day: 'dia',
          days: 'dias',
          round: 'rodada',
          rounds: 'rodadas',
        })[unit]
    );
  return translated && translated[0].toUpperCase() + translated.slice(1);
}

export function filterSpells(
  spells,
  { search = '', level = '', school = '', publication = '', damage = '' } = {}
) {
  const query = normalizeSearch(search.trim());
  return spells.filter(
    (spell) =>
      (level === '' || String(spell.level) === level) &&
      (!school || spell.school === school) &&
      (!publication || spell.publication === publication) &&
      (!damage || spellDamageTypes(spell).includes(damage)) &&
      normalizeSearch(
        `${spellName(spell)} ${spell.name} ${spellSubtitle(spell)} ${spell.publication ?? ''}`
      ).includes(query)
  );
}

export function spellEffects(spell) {
  const base = baseSpellText(spell);
  const damages = [...base.matchAll(typedDamage)].map(
    ([, value, list]) =>
      `${value} de ${translateTypes(list)
        .map((type) => damageTypes[type])
        .join(' / ')}`
  );
  for (const [, list, value, modifier] of base.matchAll(equalDamage)) {
    damages.push(
      `${value}${modifier ? ' + modificador de conjuração' : ''} de ${translateTypes(list)
        .map((type) => damageTypes[type])
        .join(' / ')}`
    );
  }
  for (const [, value] of base.matchAll(chosenDamage)) damages.push(`${value} do tipo escolhido`);
  const healing = base.match(
    new RegExp(
      `\\b(?:regains?|restores?|heals?) (?:a number of )?(?:Hit Points equal to )?(${dice})( plus your spellcasting ability modifier)?`,
      'i'
    )
  );
  const saves = Object.entries(attributes)
    .filter(([attribute]) => new RegExp(`\\b${attribute} saving throw\\b`, 'i').test(base))
    .map(([, label]) => label);
  const attacks = [
    /\branged spell attack\b/i.test(base) && 'ataque mágico à distância',
    /\bmelee spell attack\b/i.test(base) && 'ataque mágico corpo a corpo',
  ].filter(Boolean);
  return [
    ['Dano', [...new Set(damages)].join(' · ')],
    ['Cura', healing ? healing[1] + (healing[2] ? ' + modificador de conjuração' : '') : ''],
    ['Resistência', saves.join(' / ')],
    ['Ataque', attacks.join(' / ')],
  ].filter(([, value]) => value);
}

export function spellDescription(spell, { glossary = false } = {}) {
  const fields = [
    ['Fonte', spell.publication],
    ['Conjuração', translateMeasure(spell.time)],
    ['Alcance', translateMeasure(spell.range)],
    ['Duração', translateMeasure(spell.duration)],
    ['Componentes', spell.components?.split('').join(', ')],
    ...(glossary
      ? [['Tipos de dano', spellDamageTypes(spell).map(damageTypeLabel).join(' · ')]]
      : []),
    ...spellEffects(spell),
  ].filter(([, value]) => value);
  return `<div class="spell-description">
    <dl class="spell-facts">${fields
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join('')}</dl>
    ${
      spell.concentration || spell.ritual
        ? `<p class="spell-tags">
      ${spell.concentration ? '<span class="tag">Concentração</span>' : ''}
      ${spell.ritual ? '<span class="tag">Ritual</span>' : ''}</p>`
        : ''
    }
    ${spell.material ? `<p><strong>Material</strong> · ${escapeHtml(spell.translation?.material ?? spell.material)}</p>` : ''}
    ${spell.triggered ? `<p><strong>Gatilho</strong> · ${escapeHtml(spell.translation?.triggered ?? spell.triggered)}</p>` : ''}
    <p class="description" lang="${spell.translation?.text ? 'pt-BR' : 'en'}">${formatDescription(spell.translation?.text ?? spell.text, glossary)}</p>
    ${spell.translation?.text ? originalDescription(spell.name, spell.text, glossary) : ''}
  </div>`;
}

export const spellSubtitle = (spell) =>
  [spellCircle(spell.level), spellSchools[spell.school] ?? spell.school]
    .filter(Boolean)
    .join(' · ');

export function spellCard(spell) {
  const headline = spellEffects(spell).find(([label]) => label === 'Dano' || label === 'Cura');
  return `<details class="entry"><summary><strong>${escapeHtml(spellName(spell))}</strong>
    <span class="tag">${escapeHtml(spellSubtitle(spell))}</span>
    ${spell.publication ? `<span class="tag">${escapeHtml(spell.publication)}</span>` : ''}
    ${headline ? `<span class="spell-headline">${headline[0]} · ${escapeHtml(headline[1])}</span>` : ''}</summary>
    ${spell.grantedBy ? `<p class="muted">Concedida por ${escapeHtml(spell.grantedBy)}</p>` : ''}
    ${spellDescription(spell)}</details>`;
}
import { annotateTerms } from './glossary.js';
