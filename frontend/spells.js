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
export function formatDescription(value, glossary = false, referenceLink) {
  const render = glossary ? (text) => annotateTerms(text, escapeHtml) : escapeHtml;
  const renderInline = (text) => text
    .split(/(\[\[(?:[^|\[\]\n]+\|)?[^\[\]\n]+\]\])/g)
    .map((part, index) => {
      if (index % 2 === 0) return render(part);
      const [id, label = id] = part.slice(2, -2).split('|');
      const reference = referenceLink?.(id, label);
      return reference
        ? `<a class="rules-reference-link" href="${escapeHtml(reference.href)}">${gameIcon(reference.icon)}<span>${escapeHtml(label)}</span></a>`
        : render(label);
    })
    .join('');
  return String(value ?? '')
    .split(/(\*\*\*?[^*\n]+\*\*\*?|\*(?:Veja também|See also)\*)/gi)
    .map((part, index) =>
      index % 2 ? `<strong>${renderInline(part.replace(/^\*+|\*+$/g, '').trim())}</strong>` : renderInline(part)
    )
    .join('');
}
export function rulesDescriptionParts(value) {
  return String(value ?? '')
    .split(/((?:^\|[^\n]*\|[ \t]*(?:\n|$)){2,})/m)
    .map((part, index) => {
      if (index % 2 === 0) return { text: part.trim() };
      const [columns, divider, ...rows] = part
        .trim()
        .replace(/\[\[(?:[^|\[\]\n]+\|)?([^\[\]\n]+)\]\]/g, '$1')
        .split('\n')
        .map((line) =>
          line
            .trim()
            .slice(1, -1)
            .split('|')
            .map((cell) => cell.trim())
        );
      if (divider?.length === columns.length && divider.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        return { columns, rows };
      }
      return { text: part.trim() };
    });
}

export function formatRulesDescription(value, glossary = false, lang = 'pt-BR', referenceLink) {
  return rulesDescriptionParts(value)
    .map(({ columns, rows, text }) =>
      columns
        ? rulesTable(columns, rows, glossary, lang)
        : text
          ? `<div class="rules-prose" lang="${lang}">${formatRulesProse(text, glossary, referenceLink)}</div>`
          : ''
    )
    .join('');
}

function formatRulesProse(text, glossary, referenceLink) {
  return text.split(/\r?\n/).reduce((blocks, line) => {
    const value = line.trim();
    const previous = blocks.at(-1);
    const heading = /^(#{1,6})\s+(.+)$/.exec(value);
    const bullet = /^[-*]\s+(.+)$/.exec(value);
    const numbered = /^(\d+)\.\s+(.+)$/.exec(value);
    if (!value) {
      if (previous?.type === 'p') previous.closed = true;
    } else if (heading) {
      blocks.push({ type: 'heading', lines: [heading[2]], level: heading[1].length > 3 ? 'h5' : 'h4' });
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const item = bullet ? bullet[1] : numbered[2];
      if (previous?.type === type) previous.lines.push(item);
      else blocks.push({ type, lines: [item], start: numbered?.[1] });
    } else if (previous?.type === 'p' && !previous.closed) {
      previous.lines.push(value);
    } else {
      blocks.push({ type: 'p', lines: [value] });
    }
    return blocks;
  }, []).map(({ type, lines, level, start }) => {
    const render = (line) => formatDescription(line, glossary, referenceLink);
    if (type === 'heading') return `<${level}>${render(lines[0])}</${level}>`;
    if (type === 'p') return `<p class="description">${render(lines.join('\n'))}</p>`;
    const items = lines.map(render);
    const linkList = type === 'ul' && items.every((item) => /^<a class="rules-reference-link"[^>]*>.*<\/a>$/.test(item));
    return `<${type}${linkList ? ' class="rules-reference-list"' : ''}${start ? ` start="${start}"` : ''}>${items.map((item) => `<li>${item}</li>`).join('')}</${type}>`;
  }).join('');
}

export function rulesTable(columns, rows, glossary = false, lang = 'pt-BR') {
  const cellText = (value) => formatDescription(value, glossary);
  const heading = columns.filter(Boolean);
  const statBlock = heading.length === 1;
  const head = statBlock
    ? `<th colspan="${columns.length}">${cellText(heading[0])}</th>`
    : columns.map((name) => `<th scope="col">${cellText(name)}</th>`).join('');
  return `<div class="wiki-table" role="region" aria-label="${escapeHtml(heading.join(' · '))}" tabindex="0" lang="${lang}">
    <table><thead><tr>${head}</tr></thead><tbody>${rows
      .map((row) => {
        const cells =
          statBlock && row.length > 1 && row.slice(1).every((cell) => !cell)
            ? `<td colspan="${columns.length}">${cellText(row[0])}</td>`
            : row.map((cell) => `<td>${cellText(cell)}</td>`).join('');
        return `<tr>${cells}</tr>`;
      })
      .join('')}</tbody></table></div>`;
}

export const originalDescription = (name, body, glossary = false, referenceLink) =>
  `<details class="spell-original"><summary>Texto completo em inglês</summary>
    ${name ? `<p lang="en"><strong>${escapeHtml(name)}</strong></p>` : ''}
    ${formatRulesDescription(body, glossary, 'en', referenceLink)}</details>`;
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
  acid: 'Ácido',
  bludgeoning: 'Contundente',
  cold: 'Frio',
  fire: 'Fogo',
  force: 'Energia',
  lightning: 'Elétrico',
  necrotic: 'Necrótico',
  piercing: 'Perfurante',
  poison: 'Veneno',
  psychic: 'Psíquico',
  radiant: 'Radiante',
  slashing: 'Cortante',
  thunder: 'Trovejante',
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
const damageTypeLabels = { ...damageTypes, weapon: 'Tipo da Arma' };
export const damageTypeLabel = (type) => damageTypeLabels[String(type).toLowerCase()] ?? type;
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

export function spellRolls(spell, characterLevel, slotLevel = spell.level) {
  const rolls = [];
  const tier = [5, 11, 17].filter((level) => characterLevel >= level).length;
  const upgrade = spell.text?.split(/\*\*Cantrip Upgrade\.\*\*/i)[1] ?? '';
  const higher = spell.text?.split(/\*\*Using a Higher-Level Spell Slot\.\*\*/i)[1] ?? '';
  const effects = spellEffects(spell);
  if (effects.some(([label]) => label === 'Ataque') && Number.isFinite(spell.attackBonus)) {
    const beams = spell.id === 'eldritch-blast' ? 1 + tier : 1;
    rolls.push({ label: beams > 1 ? 'Ataque por raio' : 'Ataque mágico', count: 1, sides: 20, bonus: spell.attackBonus, repeat: beams });
  }
  for (const [label, value] of effects.filter(([label]) => label === 'Dano' || label === 'Cura')) {
    const kind = label === 'Dano' ? 'damage' : 'healing';
    const scale = (text) => new RegExp(`\\b${kind} increases by (\\d+)d(\\d+)`, 'i').exec(text);
    const phrases = value.split(' · ');
    for (const phrase of phrases) {
      const match = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+|modificador de conjuração))?/i.exec(phrase);
      if (!match) continue;
      const [, count, sides, sign, modifier] = match;
      const usesCastingModifier = modifier === 'modificador de conjuração';
      if (usesCastingModifier && !Number.isFinite(spell.castingModifier)) continue;
      const increase = scale(spell.level === 0 ? upgrade : higher);
      const extra = spell.level === 0 ? tier : Math.max(0, slotLevel - spell.level);
      const added = phrases.length === 1 && increase?.[2] === sides ? Number(increase[1]) * extra : 0;
      const perHit = { 'eldritch-blast': ' por raio', 'magic-missile': ' por dardo' }[spell.id] ?? '';
      rolls.push({
        label: label + perHit,
        count: Number(count) + added,
        sides: Number(sides),
        bonus: modifier ? (sign === '-' ? -1 : 1) * (usesCastingModifier ? spell.castingModifier : Number(modifier)) : 0,
        type: phrase.slice(match[0].length).trim().replace(/^de /, ''),
      });
    }
  }
  return rolls;
}

export function spellDescription(spell, { glossary = false } = {}) {
  const fields = [
    ['Fonte', spell.publication],
    ['Conjuração', translateMeasure(spell.time)],
    ['Alcance', translateMeasure(spell.range)],
    ['Duração', translateMeasure(spell.duration)],
    ['Componentes', spell.components?.split('').join(', ')],
    [
      'Usos gratuitos',
      spell.free
        ? `${spell.free.uses} por ${spell.free.per === 'short' ? 'descanso curto' : 'descanso longo'}`
        : undefined,
    ],
    ['CD de magia', spell.saveDC],
    [
      'Ataque mágico',
      spell.attackBonus != null
        ? (spell.attackBonus >= 0 ? '+' : '') + spell.attackBonus
        : undefined,
    ],
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
    ${formatRulesDescription(spell.translation?.text ?? spell.text, glossary, spell.translation?.text ? 'pt-BR' : 'en')}
    ${
      spell.references
        ?.map(
          (
            entry
          ) => `<details class="entry"><summary><strong>${escapeHtml(entry.translation?.name ?? entry.name)}</strong></summary>
      ${formatRulesDescription(entry.translation?.body ?? entry.body, glossary)}
      ${entry.translation?.body && entry.body ? originalDescription(entry.name, entry.body, glossary) : ''}
    </details>`
        )
        .join('') ?? ''
    }
    ${spell.creatureReference ? `<a class="navigation-row" href="#compendio/creatures">${gameIcon('dragonborn', 'game-emblem')}<span>Consultar as fichas de criaturas para esta transformação</span><span aria-hidden="true">›</span></a>` : ''}
    ${spell.translation?.text ? originalDescription(spell.name, spell.text, glossary) : ''}
  </div>`;
}

export const spellSubtitle = (spell) =>
  [spellCircle(spell.level), spellSchools[spell.school] ?? spell.school]
    .filter(Boolean)
    .join(' · ');

export const spellTags = (spell) =>
  [spellSubtitle(spell), ...spellDamageTypes(spell).map(damageTypeLabel), spell.publication].filter(
    Boolean
  );

export function gameIcon(id, className = '') {
  return `<svg class="game-icon ${className}" aria-hidden="true" focusable="false" viewBox="0 0 512 512"><use href="/game-icons.svg#${escapeHtml(id)}"></use></svg>`;
}

const illustratedSpells = new Set([
  'alarm', 'cure-wounds', 'fireball', 'ice-knife', 'lightning-bolt', 'magic-missile', 'shield',
]);

export function spellIcon(spell) {
  if (spell.localIcon === '/spell-icons/' + spell.id + '.webp') {
    return `<img class="game-icon game-emblem spell-art" src="${escapeHtml(spell.localIcon)}" alt="" width="32" height="32" loading="lazy" decoding="async">`;
  }
  const school = Object.hasOwn(spellSchools, spell.school) ? spell.school.toLowerCase() : 'evocation';
  return gameIcon(illustratedSpells.has(spell.id) ? spell.id : school, 'game-emblem');
}

export function spellTagMarkup(spell) {
  const tag = (label) => label && `<span class="tag">${escapeHtml(label)}</span>`;
  const damageTags = spellDamageTypes(spell).map((type) => {
    const icon = type === 'lightning' ? 'lightning-bolt' : type;
    const symbol = type === 'cold' ? '<span class="damage-snowflake" aria-hidden="true">❄︎</span>' : gameIcon(icon);
    return `<span class="tag damage-tag" data-damage="${type}">${symbol}${escapeHtml(damageTypeLabel(type))}</span>`;
  });
  return [tag(spellSubtitle(spell)), ...damageTags, tag(spell.publication)].filter(Boolean).join(' ');
}

export function spellCard(spell, actions = '') {
  const headline = spellEffects(spell).find(([label]) => label === 'Dano' || label === 'Cura');
  return `<details class="entry"><summary><strong class="icon-label">${spellIcon(spell)}${escapeHtml(spellName(spell))}</strong>
    ${spellTagMarkup(spell)}
    ${headline ? `<span class="spell-headline">${headline[0]} · ${escapeHtml(headline[1])}</span>` : ''}</summary>
    ${spell.grantedBy ? `<p class="muted">Concedida por ${escapeHtml(spell.grantedBy)}</p>` : ''}
    ${actions}
    ${spellDescription(spell)}</details>`;
}
import { annotateTerms } from './glossary.js';
