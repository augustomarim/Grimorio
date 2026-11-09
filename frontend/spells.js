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
export const spellName = (spell) => spell.translation?.name ?? spell.name;
export const spellCircle = (level) => (level === 0 ? 'Truque' : `${level}º círculo`);

const schools = {
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
const dice = '\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?';
const typedDamage = new RegExp(`\\b(${dice})\\s+(${types})\\s+damage\\b`, 'gi');
const equalDamage = new RegExp(
  `\\b(${types}) damage equal to (${dice})( plus your spellcasting ability modifier)?`,
  'gi'
);
const chosenDamage = new RegExp(`\\b(${dice})\\s+damage of the chosen type\\b`, 'gi');

function translateMeasure(value) {
  return value
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
}

export function spellEffects(spell) {
  const base = (spell.text ?? '').split(
    /\*\*(?:Cantrip Upgrade|Using a Higher-Level Spell Slot|At Higher Levels)\b/i
  )[0];
  const damages = [...base.matchAll(typedDamage)].map(
    ([, value, type]) => `${value} de ${damageTypes[type.toLowerCase()]}`
  );
  for (const [, type, value, modifier] of base.matchAll(equalDamage)) {
    damages.push(
      `${value}${modifier ? ' + modificador de conjuração' : ''} de ${damageTypes[type.toLowerCase()]}`
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
    [
      'Dano',
      damages.length
        ? [...new Set(damages)].join(' · ')
        : /\b(?:take[sn]?|taking|deal[st]?|dealing|damage roll)\b[^.!?]{0,70}\bdamage\b/i.test(base)
          ? 'consulte a descrição'
          : '',
    ],
    ['Cura', healing ? healing[1] + (healing[2] ? ' + modificador de conjuração' : '') : ''],
    ['Resistência', saves.join(' / ')],
    ['Ataque', attacks.join(' / ')],
  ].filter(([, value]) => value);
}

export function spellDescription(spell) {
  const fields = [
    ['Conjuração', translateMeasure(spell.time)],
    ['Alcance', translateMeasure(spell.range)],
    ['Duração', translateMeasure(spell.duration)],
    ['Componentes', spell.components?.split('').join(', ')],
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
    <p class="description" lang="${spell.translation?.text ? 'pt-BR' : 'en'}">${escapeHtml(spell.translation?.text ?? spell.text)}</p>
    ${
      spell.translation?.text
        ? `<details class="spell-original"><summary>Original em inglês</summary>
      <p class="description" lang="en">${escapeHtml(spell.text)}</p></details>`
        : ''
    }
  </div>`;
}

export const spellSubtitle = (spell) =>
  [spellCircle(spell.level), schools[spell.school] ?? spell.school].filter(Boolean).join(' · ');

export function spellCard(spell) {
  const headline = spellEffects(spell).find(([label]) => label === 'Dano' || label === 'Cura');
  return `<details class="entry"><summary><strong>${escapeHtml(spellName(spell))}</strong>
    <span class="tag">${escapeHtml(spellSubtitle(spell))}</span>
    ${headline ? `<span class="spell-headline">${headline[0]} · ${escapeHtml(headline[1])}</span>` : ''}</summary>
    ${spell.source ? `<p class="muted">${escapeHtml(spell.source)}</p>` : ''}
    ${spellDescription(spell)}</details>`;
}
