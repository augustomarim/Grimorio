import fs from 'node:fs/promises';
import { normalizeWeaponPropertyText, weaponPropertiesLabel } from '../frontend/compendium.js';
import {
  content,
  spells,
  items,
  rules,
  tools,
  languages,
  glossary,
  alignments,
} from '@freshmag/one-dndb/data';

const directory = new URL('../data/reference/', import.meta.url);
const read = async (name) => JSON.parse(await fs.readFile(new URL(name, directory), 'utf8'));
await fs.mkdir(directory, { recursive: true });
const source = JSON.parse(
  await fs.readFile(new URL('./reference-source.json', import.meta.url), 'utf8')
);
const base =
  'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/' + source.commit + '/data/';
const fetchData = async (path) => {
  const name = path.split('/').at(-1);
  try {
    return await read(name);
  } catch {}
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Referência indisponível ' + path);
  const data = await response.json();
  await fs.writeFile(new URL(name, directory), JSON.stringify(data));
  return data;
};
async function communityData(name) {
  const cacheName = 'pt-' + name;
  try {
    return await read(cacheName);
  } catch {}
  const response = await fetch(
    'https://raw.githubusercontent.com/decito/dnd5e-pt-br/' +
      source.translationCommit +
      '/compendium/' +
      name,
    { signal: AbortSignal.timeout(30000) }
  );
  if (!response.ok) throw new Error('Tradução comunitária indisponível ' + name);
  const data = await response.json();
  await fs.writeFile(new URL(cacheName, directory), JSON.stringify(data));
  return data;
}
const normalize = (name) =>
  String(name)
    .toLowerCase()
    .replaceAll('’', "'")
    .replace(/[^a-z0-9]/g, '');
const id = (name) =>
  name
    .toLowerCase()
    .replaceAll('’', '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const plain = (value) => {
  let text = String(value ?? '');
  while (/\{@[^{}]+\}/.test(text)) {
    text = text.replace(/\{@([^{}]+)\}/g, (_, tag) => {
      const [kind, ...rest] = tag.split(' ');
      const data = rest.join(' ');
      const parts = data.split('|');
      if (kind === 'h') return 'Hit. ';
      if (kind === 'atk' || kind === 'atkr')
        return /r/.test(data) ? 'Ranged attack.' : 'Melee attack.';
      if (kind === 'actSave') return 'Saving throw ' + data.toUpperCase() + '.';
      if (kind === 'actSaveFail') return 'Failure.';
      if (kind === 'actSaveSuccess') return 'Success.';
      if (kind === 'actSaveFailBy') return 'Failure by ' + data + ' or more.';
      if (kind === 'actSaveSuccessOrFail' || kind === 'actSaveFailOrSuccess')
        return 'Success or failure.';
      if (kind === 'actTrigger') return 'Trigger.';
      if (kind === 'actResponse') return 'Response.';
      if (kind === 'hit') return Number(data) >= 0 ? '+' + data : data;
      return parts[2] ?? parts[0];
    });
  }
  return text.replaceAll('summonSpellLevel', "the spell's level");
};
function entries(value) {
  if (typeof value === 'string' || typeof value === 'number') return plain(value);
  if (Array.isArray(value)) return value.map(entries).join('\n\n');
  if (!value) return '';
  if (value.roll) return value.roll.exact ?? value.roll.min + '–' + value.roll.max;
  if (value.type === 'table') {
    const rows = (value.rows ?? []).map((row) => (row.row ?? row).map(entries));
    return table((value.colLabels ?? []).map(plain), rows);
  }
  const name = value.name ? '**' + plain(value.name).replace(/\.$/, '') + '.** ' : '';
  return name + entries(value.entries ?? value.items ?? value.entry ?? value.text ?? '');
}
const table = (columns, rows) =>
  [columns, columns.map(() => '---'), ...rows]
    .map(
      (row) =>
        '| ' +
        row.map((cell) => String(cell).replaceAll('|', '/').replaceAll('\n', ' ')).join(' | ') +
        ' |'
    )
    .join('\n');
const signed = (value) => (value >= 0 ? '+' + value : String(value));
function monsterBody(monster) {
  const ac = (monster.ac ?? [])
    .map((ac) => (typeof ac === 'number' ? ac : (ac.special ?? ac.ac)))
    .join(' / ');
  const hp =
    monster.hp?.special ??
    [monster.hp?.average, monster.hp?.formula && '(' + monster.hp.formula + ')']
      .filter(Boolean)
      .join(' ');
  const speed = Object.entries(monster.speed ?? {})
    .filter(([, value]) => value !== true)
    .map(
      ([kind, value]) =>
        kind +
        ' ' +
        (typeof value === 'number'
          ? value
          : [value.number, value.condition].filter(Boolean).join(' ')) +
        ' ft.'
    )
    .join(', ');
  const type = typeof monster.type === 'string' ? monster.type : monster.type?.type;
  const conditions = ['resist', 'immune', 'vulnerable', 'conditionImmune'].flatMap((key) =>
    monster[key]?.length
      ? [
          '**' +
            {
              resist: 'Resistances',
              immune: 'Immunities',
              vulnerable: 'Vulnerabilities',
              conditionImmune: 'Condition immunities',
            }[key] +
            '.** ' +
            monster[key]
              .map((entry) =>
                typeof entry === 'string'
                  ? entry
                  : entries(entry[key] ?? entry.note ?? entry.special)
              )
              .join(', '),
        ]
      : []
  );
  const body = [
    (monster.size ?? []).join('/') +
      ' · ' +
      (typeof type === 'string' ? type : (type?.choose?.join(' / ') ?? '')) +
      ' · ' +
      (monster.alignment ?? []).join('/'),
    '**Armor Class.** ' + ac + '\n**Hit Points.** ' + hp + '\n**Speed.** ' + speed,
    table(
      ['Ability', 'Score', 'Modifier', 'Saving throw'],
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => {
        const modifier = Math.floor((monster[key] - 10) / 2);
        return [
          key.toUpperCase(),
          monster[key],
          signed(modifier),
          monster.save?.[key] ?? signed(modifier),
        ];
      })
    ),
    monster.skill &&
      '**Skills.** ' +
        Object.entries(monster.skill)
          .map(([skill, bonus]) => skill + ' ' + bonus)
          .join(', '),
    ...conditions,
    '**Senses.** ' +
      (monster.senses ?? []).join(', ') +
      '. Passive Perception ' +
      (monster.passive ?? 10),
    monster.languages?.length && '**Languages.** ' + monster.languages.join(', '),
    '**Challenge.** ' +
      (monster.cr?.cr ?? monster.cr ?? '—') +
      (monster.pbNote ? '. Proficiency Bonus ' + monster.pbNote : ''),
    ...['trait', 'action', 'bonus', 'reaction', 'legendary', 'spellcasting'].flatMap((kind) => {
      const collection = monster[kind];
      if (!collection?.length) return [];
      const heading = {
        trait: 'Traits',
        action: 'Actions',
        bonus: 'Bonus Actions',
        reaction: 'Reactions',
        legendary: 'Legendary Actions',
        spellcasting: 'Spellcasting',
      }[kind];
      return [
        '**' + heading + '**',
        ...collection.map((entry) => {
          if (kind !== 'spellcasting') return entries(entry);
          const lists = ['will', 'daily', 'spells'].flatMap((key) => {
            const value = entry[key];
            if (!value) return [];
            if (Array.isArray(value)) return ['At will. ' + value.map(plain).join(', ')];
            return Object.entries(value).map(
              ([level, list]) => level + '. ' + (list.spells ?? list).map(plain).join(', ')
            );
          });
          return (
            entries(entry.headerEntries) +
            '\n' +
            lists.join('\n') +
            '\n' +
            entries(entry.footerEntries)
          );
        }),
      ];
    }),
  ].filter(Boolean);
  return plain(body.join('\n\n'));
}
let cache;
try {
  cache = await read('translation-cache.json');
} catch {
  cache = {};
}
let translated = 0;
let nextTranslationAt = 0;
async function prefetchTranslations(texts) {
  const unique = [
    ...new Set(
      texts.filter(
        (text) =>
          typeof text === 'string' &&
          text &&
          !cache[text] &&
          !text.includes('\n|') &&
          text.length <= 3500
      )
    ),
  ];
  const batches = [];
  let batch = [];
  let length = 0;
  for (const text of unique) {
    const encoded = encodeURIComponent(text).length;
    if (encoded > 6000) continue;
    if (batch.length && (length + encoded > 6000 || batch.length >= 8)) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(text);
    length += encoded;
  }
  if (batch.length) batches.push(batch);
  for (let start = 0; start < batches.length; start += 3) {
    await Promise.all(
      batches.slice(start, start + 3).map(async (texts) => {
        const query = new URLSearchParams({ client: 'dict-chrome-ex', sl: 'en', tl: 'pt' });
        for (const text of texts) query.append('q', text);
        try {
          const response = await fetch('https://clients5.google.com/translate_a/t?' + query, {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) return;
          const result = await response.json();
          if (
            !Array.isArray(result) ||
            result.length !== texts.length ||
            result.some((text) => typeof text !== 'string')
          )
            return;
          texts.forEach((text, index) => {
            cache[text] = result[index];
          });
        } catch {}
      })
    );
    await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
    if (start % 30 === 0)
      console.log('Lotes de tradução', Math.min(start + 3, batches.length), '/', batches.length);
  }
}
async function translate(text) {
  if (!text) return '';
  if (cache[text]) return cache[text];
  // Tables are translated cell by cell to preserve columns and numeric formulas.
  const lines = text.split('\n');
  if (lines.some((line) => line.startsWith('|'))) {
    const parts = text.split(/((?:^\|[^\n]*\|(?:\n|$))+)/m).filter((part) => part.trim());
    if (parts.length > 1) {
      const output = [];
      for (const part of parts) output.push(await translate(part.trim()));
      return (cache[text] = output.join('\n\n'));
    }
    const result = [];
    for (const line of lines) {
      if (!line.startsWith('|')) result.push(await translate(line));
      else if (/^\|(?: *--- *\|)+$/.test(line)) result.push(line);
      else
        result.push(
          '| ' +
            (
              await Promise.all(
                line
                  .slice(1, -1)
                  .split('|')
                  .map((cell) => translate(cell.trim()))
              )
            ).join(' | ') +
            ' |'
        );
    }
    return (cache[text] = result.join('\n'));
  }
  if (/^[\d\s\W]+$/.test(text) || /^[+-]?\d+(?:d\d+)?$/.test(text)) return text;
  const ability = { STR: 'FOR', DEX: 'DES', CON: 'CON', INT: 'INT', WIS: 'SAB', CHA: 'CAR' }[text];
  if (ability) return ability;
  if (text.length > 3500) {
    const pieces = text.match(/[\s\S]{1,3200}(?:\s|$)/g) ?? [text];
    const output = [];
    for (const piece of pieces) output.push(await translate(piece));
    return (cache[text] = output.join(' '));
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const delay = Math.max(0, nextTranslationAt - Date.now());
      nextTranslationAt = Date.now() + delay + 180;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const url = new URL(
        attempt % 2
          ? 'https://translate.google.com/translate_a/single'
          : 'https://translate.googleapis.com/translate_a/single'
      );
      for (const [key, value] of Object.entries({
        client: 'gtx',
        sl: 'en',
        tl: 'pt',
        dt: 't',
        q: text,
      }))
        url.searchParams.set(key, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        if (response.status === 429) {
          await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
          nextTranslationAt = Date.now() + (attempt % 2 ? 30000 : 1000);
        }
        throw new Error('Translation ' + response.status);
      }
      const data = await response.json();
      const result = data[0].map((part) => part[0] ?? '').join('');
      if (!result) throw new Error('Empty translation');
      cache[text] = result;
      translated++;
      return result;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
const monsters = [
  ...(await fetchData('bestiary/bestiary-xmm.json')).monster.filter((monster) => monster.srd52),
  ...(await fetchData('bestiary/bestiary-xphb.json')).monster,
  ...(await fetchData('bestiary/bestiary-au.json')).monster.filter((monster) =>
    ['Battle Familiar', 'Dinosaur Spirit', 'Plant Spirit', 'Vestige Companion'].includes(
      monster.name
    )
  ),
  ...(await fetchData('bestiary/bestiary-efa.json')).monster.filter((monster) =>
    /Homunculus Servant/i.test(monster.name)
  ),
];
const translatedNames = (await communityData('dnd5e.monsters.json')).entries;
const creatures = [];
// Limit concurrency to keep imports reproducible and avoid translation rate limits.
for (let start = 0; start < monsters.length; start += 3) {
  await Promise.all(
    monsters.slice(start, start + 3).map(async (monster) => {
      const body = monsterBody(monster);
      creatures.push({
        id: id(monster.name),
        name: monster.name,
        body,
        source:
          {
            XMM: 'SRD 5.2.1 · Criaturas',
            XPHB: 'Livro do Jogador (2024)',
            AU: 'Arcana Unleashed',
            EFA: 'Eberron - Forge of the Artificer',
          }[monster.source] ?? monster.source,
        cr: String(monster.cr?.cr ?? monster.cr ?? ''),
        type: typeof monster.type === 'string' ? monster.type : monster.type?.type,
        summonedBySpell: monster.summonedBySpell?.split('|')[0],
        translation: {
          name: translatedNames[monster.name]?.name ?? (await translate(monster.name)),
          body: await translate(body),
        },
      });
    })
  );
  await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
  if (start % 30 === 0 || start + 3 >= monsters.length)
    console.log('Fichas', Math.min(start + 3, monsters.length), '/', monsters.length);
}
const tableSpells = [];
const sources = ['spells/spells-xphb.json', 'spells/spells-au.json', 'spells/spells-frhof.json'];
const collectTables = (value) => {
  if (!value || typeof value === 'string') return [];
  if (Array.isArray(value)) return value.flatMap(collectTables);
  if (value.type === 'table') return [value];
  return Object.values(value).flatMap(collectTables);
};
for (const path of sources) {
  for (const spell of (await fetchData(path)).spell) {
    const known = spells.find((entry) => normalize(entry.name) === normalize(spell.name));
    if (!known) continue;
    for (const value of collectTables([spell.entries, spell.entriesHigherLevel])) {
      const body = entries(value);
      tableSpells.push({
        spell: known.id,
        name: value.caption ?? spell.name,
        body,
        translation: { body: await translate(body) },
      });
    }
  }
}
const options = [];
for (const option of (await fetchData('optionalfeatures.json')).optionalfeature.filter(
  (entry) =>
    entry.source === 'XPHB' &&
    [entry.featureType].flat().some((type) => ['MV:B', 'MM'].includes(type))
)) {
  const body = entries(option.entries);
  options.push({
    id: option.name,
    name: option.name,
    body,
    translation: { name: await translate(option.name), body: await translate(body) },
  });
}
const archer = content
  .find(({ id }) => id === 'arcane-archer')
  .features.find(({ name }) => name === 'Arcane Shot Options');
const archerIndex = content.find(({ id }) => id === 'arcane-archer').features.indexOf(archer);
const locale = JSON.parse(await fs.readFile(new URL('../frontend/pt-BR.json', import.meta.url), 'utf8'));
const shotPattern = /\*\*([^*]+?)\.\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/g;
const originalShots = [...archer.body.matchAll(shotPattern)];
const localizedShots = [...locale.content['arcane-archer'].features[archerIndex].body.matchAll(shotPattern)];
if (originalShots.length !== localizedShots.length)
  throw new Error('As opções de Disparo Arcano precisam corresponder ao texto original.');
for (const [index, match] of originalShots.entries()) {
  const [, name, body] = match;
  const [, localizedName, localizedBody] = localizedShots[index];
  options.push({
    id: name,
    name,
    body,
    translation: { name: localizedName, body: localizedBody },
  });
}
const itemNames = (await communityData('dnd5e.items.json')).entries;
const missingPlans = new Set([
  'Manifold Tool',
  'Repeating Shot',
  'Returning Weapon',
  'Boots of the Winding Path',
  'Dazzling Weapon',
  'Helm of Awareness',
  'Mind Sharpener',
  'Repulsion Shield',
  'Spell-Refueling Ring',
]);
const extraItems = [
  ...(await fetchData('items.json')).item.filter(
    (item) => item.source === 'EFA' && missingPlans.has(item.name)
  ),
  ...(await fetchData('magicvariants.json')).magicvariant
    .filter((item) => item.inherits?.source === 'EFA' && missingPlans.has(item.name))
    .map((item) => ({ ...item, ...item.inherits })),
].map((item) => {
  const weapon = ['Dazzling Weapon', 'Repeating Shot', 'Returning Weapon'].includes(item.name);
  return {
    id: id(item.name),
    name: item.name,
    magic: true,
    source: 'Eberron - Forge of the Artificer',
    kind: weapon ? 'weapon' : item.name === 'Repulsion Shield' ? 'armor' : 'wondrous',
    rarity: item.rarity,
    text: entries(item.entries),
    ...(item.reqAttune
      ? { attunement: typeof item.reqAttune === 'string' ? item.reqAttune : 'Requires Attunement' }
      : {}),
    ...(weapon
      ? {
          baseItems: items
            .filter(
              (base) =>
                base.weapon &&
                (item.name !== 'Repeating Shot' ||
                  base.weapon.properties?.includes('ammunition')) &&
                (item.name !== 'Returning Weapon' || base.weapon.properties?.includes('thrown'))
            )
            .map(({ name }) => name),
        }
      : {}),
  };
});
const localizedItems = {};
const allItems = [...items, ...extraItems];
await prefetchTranslations(
  allItems.flatMap((item) => [
    item.name,
    item.text,
    item.damage,
    item.properties,
    item.attunement,
    item.ac,
  ])
);
for (let start = 0; start < allItems.length; start += 5) {
  await Promise.all(
    allItems.slice(start, start + 5).map(async (item) => {
      localizedItems[item.id] = {
        name: itemNames[item.name]?.name ?? (await translate(item.name)),
        text: normalizeWeaponPropertyText(await translate(item.text)),
        ...(item.damage ? { damage: await translate(item.damage) } : {}),
        ...(item.properties
          ? {
              properties: item.weapon
                ? weaponPropertiesLabel(item.properties)
                : await translate(item.properties),
            }
          : {}),
        ...(item.attunement ? { attunement: await translate(item.attunement) } : {}),
        ...(item.ac ? { ac: await translate(item.ac) } : {}),
      };
    })
  );
  await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
  if (start % 50 === 0 || start + 5 >= allItems.length)
    console.log('Itens', Math.min(start + 5, allItems.length), '/', allItems.length);
}
const localizedRules = {};
await prefetchTranslations(rules.flatMap((rule) => [rule.name, plain(rule.text)]));
for (let start = 0; start < rules.length; start += 3) {
  await Promise.all(
    rules.slice(start, start + 3).map(async (rule) => {
      localizedRules[rule.id] = {
        name: await translate(rule.name),
        text: await translate(plain(rule.text)),
      };
    })
  );
  await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
  console.log('Regras', Math.min(start + 3, rules.length), '/', rules.length);
}
const collections = {};
for (const [kind, list] of Object.entries({ tools, languages, glossary, alignments })) {
  await prefetchTranslations(list.flatMap((entry) => [entry.name, entry.body, entry.utilize]));
  collections[kind] = {};
  for (const entry of list) {
    collections[kind][entry.id] = {
      name: await translate(entry.name),
      ...(entry.body ? { body: await translate(entry.body) } : {}),
      ...(entry.utilize ? { utilize: await translate(entry.utilize) } : {}),
    };
  }
}
const localization = JSON.parse(
  await fs.readFile(new URL('../frontend/pt-BR.json', import.meta.url), 'utf8')
);
const sections = {};
const features = {};
for (const entry of content) {
  for (const section of entry.sections ?? []) {
    if (localization.content[entry.id]?.sections?.[section.heading]) continue;
    (sections[entry.id] ??= {})[section.heading] = {
      name: await translate(section.heading),
      body: await translate(section.body),
    };
  }
  for (const [index, feature] of (entry.features ?? []).entries()) {
    if (!feature.body?.includes('| ---')) continue;
    const translatedFeature = localization.content[entry.id]?.features?.[index];
    if (translatedFeature?.statBlocks?.length || translatedFeature?.tables?.length) continue;
    const sourceDividers = feature.body.match(/^\|(?: *--- *\|)+$/gm)?.length ?? 0;
    const localDividers = translatedFeature?.body?.match(/^\|(?: *--- *\|)+$/gm)?.length ?? 0;
    const malformed = translatedFeature?.body
      ?.split('\n')
      .some(
        (line, index, lines) =>
          /^\|(?: *--- *\|)+$/.test(line) && !lines[index - 1]?.startsWith('|')
      );
    if (localDividers === sourceDividers && !malformed && localDividers > 0) continue;
    (features[entry.id] ??= {})[feature.name] = {
      name: translatedFeature?.name ?? (await translate(feature.name)),
      body: await translate(feature.body),
    };
  }
  await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
}
const result = {
  source: {
    ...source,
    translations: 'https://github.com/decito/dnd5e-pt-br',
    translationMethod: 'Community names and automatic translation with original text retained',
  },
  creatures: creatures.sort((a, b) => a.id.localeCompare(b.id)),
  tableSpells,
  options,
  items: localizedItems,
  rules: localizedRules,
  ...collections,
  extraItems,
  sections,
  features,
  slotTable: JSON.parse(
    (
      await fs.readFile(
        new URL('../backend/src/rules/multiclass-progression.ts', import.meta.url),
        'utf8'
      )
    )
      .match(/const slotsByLevel:[^=]+=(\s*\[[\s\S]*?\n\]);/)[1]
      .replace(/,\s*\]/g, ']')
  ),
};
await fs.writeFile(
  new URL('../frontend/reference.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n'
);
await fs.writeFile(new URL('translation-cache.json', directory), JSON.stringify(cache));
console.log(
  'Referências importadas',
  creatures.length,
  tableSpells.length,
  options.length,
  translated
);
