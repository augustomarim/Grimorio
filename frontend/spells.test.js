import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as raw from '@freshmag/one-dndb/data';
import { displayName, indexCatalog, newCharacter, projectCharacter } from './rules.js';
import {
  filterSpells,
  formatDescription,
  spellCard,
  spellDescription,
  spellEffects,
  spellRolls,
  spellTags,
} from './spells.js';
import { completeRest, playResources, rollDice, updatePlayHP } from './mechanics.js';

const locale = JSON.parse(readFileSync(new URL('./pt-BR.json', import.meta.url), 'utf8'));
const catalog = indexCatalog({ ...raw, revision: raw.REVISION }, locale);
const effects = (id) => Object.fromEntries(spellEffects(catalog.bySpell.get(id)));

test('play tracks temporary HP, Hit Dice, and spell slots across both rests', () => {
  const calculated = {
    maximumHP: 18,
    hitDice: ['2d8', '1d8', '1d10'],
    commonSlots: [{ level: 1, maximum: 2 }],
    casting: [{ pact: true, slots: [{ level: 2, maximum: 2 }] }],
  };
  let play = updatePlayHP({ temporaryHP: 4 }, 18, 'damage', 10);
  assert.deepEqual(play, { temporaryHP: 0, damage: 6 });
  play = { ...play, shortRest: true, hitDice: { 8: 1 }, slots: { 'spell-1': 1, pact: 1 }, free: { 'short:test': 1, 'long:test': 1 } };
  const short = completeRest(play, 'short');
  const resources = playResources({ play: short }, calculated);
  assert.equal(resources.currentHP, 12);
  assert.deepEqual(resources.hitDice.map(({ remaining }) => remaining), [2, 1]);
  assert.deepEqual(resources.slots.map(({ remaining }) => remaining), [1, 2]);
  assert.deepEqual(short.free, { 'long:test': 1 });
  assert.equal(playResources({ play: completeRest(short, 'long') }, calculated).currentHP, 18);
  assert.equal(rollDice(2, 6, 3, () => 0.5).total, 11);
});

test('spell rolls scale common damage and healing, and keep Eldritch Blast beams separate', () => {
  const fireball = spellRolls(catalog.bySpell.get('fireball'), 7, 4);
  assert.ok(fireball.some(({ count, sides }) => count === 9 && sides === 6));
  const healing = spellRolls({ ...catalog.bySpell.get('cure-wounds'), castingModifier: 3 }, 5, 2);
  assert.ok(healing.some(({ count, sides, bonus }) => count === 4 && sides === 8 && bonus === 3));
  const bolt = spellRolls({ ...catalog.bySpell.get('fire-bolt'), attackBonus: 5 }, 5);
  assert.ok(bolt.some(({ count, sides }) => count === 2 && sides === 10));
  const blast = spellRolls({ ...catalog.bySpell.get('eldritch-blast'), attackBonus: 7 }, 11);
  assert.ok(blast.some(({ repeat, sides, bonus }) => repeat === 3 && sides === 20 && bonus === 7));
});

function assertDicePreserved(original, translation, label) {
  const translatedDice = new Set(translation.toLowerCase().match(/\b\d+d\d+\b/g));
  for (const [dice] of original.matchAll(/\b\d+d\d+\b/gi)) {
    assert.ok(translatedDice.has(dice.toLowerCase()), `${label}: ${dice}`);
  }
}

test('spell, feat, trait and class feature translations retain the original dice', () => {
  assert.equal(locale.revision, raw.REVISION);
  for (const spell of catalog.spells) {
    assert.ok(spell.translation?.name && spell.translation?.text, spell.id);
    assertDicePreserved(spell.text, spell.translation.text, spell.id);
  }
  for (const feat of raw.feats) {
    const translation = locale.feats[feat.id];
    assert.ok(translation?.name && translation?.text, feat.id);
    assertDicePreserved(feat.text, translation.text, feat.id);
  }
  for (const entry of catalog.content) {
    for (const feature of [...(entry.traits ?? []), ...(entry.features ?? [])]) {
      assert.ok(
        feature.translation?.name && feature.translation?.body,
        `${entry.id}: ${feature.name}`
      );
      assertDicePreserved(
        feature.body,
        [feature.translation.body, ...(feature.translation.statBlocks ?? []).map(({ body }) => body)].join('\n'),
        `${entry.id}: ${feature.name}`
      );
    }
  }
});

test('Bard translations retain the proficiency and reaction limits', () => {
  const { features } = catalog.byContent.get('bard');
  const jack = features.find(({ name }) => name === 'Jack of all Trades').translation;
  const countercharm = features.find(({ name }) => name === 'Countercharm').translation;
  assert.equal(jack.name, 'Pau pra Toda Obra');
  assert.match(jack.body, /arredondada para baixo/);
  assert.match(jack.body, /bônus de proficiência ainda não se aplique/);
  assert.equal(countercharm.name, 'Contra-Encantamento');
  assert.match(countercharm.body, /até 30 pés/);
  assert.match(countercharm.body, /reação para refazer o teste. A nova jogada tem vantagem/);
});

test('spell effects keep base damage, saving throws and healing separate', () => {
  assert.deepEqual(effects('fireball'), { Dano: '8d6 de Fogo', Resistência: 'Destreza' });
  assert.deepEqual(effects('acid-splash'), { Dano: '1d6 de Ácido', Resistência: 'Destreza' });
  assert.deepEqual(effects('cure-wounds'), { Cura: '2d8 + modificador de conjuração' });
  assert.deepEqual(effects('guidance'), {});
  assert.deepEqual(effects('friends'), { Resistência: 'Sabedoria' });
  assert.deepEqual(effects('armor-of-agathys'), { Dano: '5 de Frio' });
  assert.doesNotMatch(spellCard(catalog.bySpell.get('friends')), /spell-headline/);
  assert.match(effects('chromatic-orb').Dano, /3d8 do tipo escolhido/);
});

test('damage filters and tags agree for spells with a choice of damage types', () => {
  const orb = catalog.bySpell.get('chromatic-orb');
  const options = [orb, catalog.bySpell.get('fireball'), catalog.bySpell.get('guidance')];
  assert.deepEqual(filterSpells(options, { damage: 'cold' }), [orb]);
  assert.ok(spellTags(orb).includes('Frio'));
  assert.ok(spellTags(orb).includes('Fogo'));
  assert.match(spellCard(orb), /data-damage="cold"[^>]*>.*❄.*Frio<\/span>/);
  assert.ok(!spellTags(options[2]).includes('Frio'));
});

test('translated feat names reach the builder and the compendium', () => {
  const artist = catalog.byFeat.get('arcane-artist');
  const draft = { ...newCharacter('test'), species: 'human' };
  const originFeat = projectCharacter(draft, catalog).groups.find(({ key }) =>
    key.endsWith('/versatile')
  );
  assert.equal(
    displayName(originFeat.options.find(({ id }) => id === artist.id)),
    'Artista Arcano'
  );
  assert.match(artist.translation.text, /aprende Ilusão Menor/);
  assert.match(artist.translation.text, /30 pés/);
  assert.equal(displayName(catalog.byFeat.get('war-caster')), 'Conjurador de Guerra');
  assert.equal(
    displayName(catalog.styles.find(({ id }) => id === 'blind-fighting')),
    'Combate às Cegas'
  );
});

test('species, backgrounds and subclasses have localized names without changing catalog IDs', () => {
  for (const entry of [...catalog.species, ...catalog.backgrounds, ...catalog.subclasses]) {
    assert.ok(entry.translation?.name, entry.id);
    assert.equal(catalog.byContent.get(entry.id), entry);
  }
  assert.equal(displayName(catalog.byContent.get('centaur')), 'Centauro');
  assert.equal(displayName(catalog.byContent.get('acolyte')), 'Acólito');
  assert.equal(displayName(catalog.byContent.get('battle-master')), 'Mestre de Batalha');
});

test('aasimar revelation retains all three translated options and unlocks at level 3', () => {
  const draft = { ...newCharacter('test'), species: 'aasimar', class: 'fighter' };
  const revelation = ({ name }) => name === 'Celestial Revelation';
  assert.equal(projectCharacter(draft, catalog).features.find(revelation), undefined);
  const feature = projectCharacter({ ...draft, level: 3 }, catalog).features.find(revelation);
  assert.deepEqual(feature.options.map(displayName), [
    'Asas Celestiais',
    'Radiância Interior',
    'Mortalha Necrótica',
  ]);
  assert.ok(feature.options.every((option) => option.summary && option.translation?.summary));
  assert.match(feature.translation.body, /descanso longo/);
  assert.match(feature.translation.body, /bônus de proficiência/);
});

test('background lore and supplemental companion stat blocks are available to the frontend', () => {
  assert.ok(catalog.backgrounds.every((entry) => entry.summary && entry.translation?.summary));
  const feature = catalog.byContent
    .get('beast-master')
    .features.find(({ name }) => name === 'Primal Companion');
  assert.deepEqual(
    feature.translation.statBlocks.map(({ name }) => name),
    ['Fera da Terra', 'Fera do Mar', 'Fera do Céu']
  );
  assert.match(feature.translation.statBlocks[1].body, /natação 60 pés/);
  assert.match(feature.translation.statBlocks[2].body, /voo 60 pés/);
});

test('spell search combines name, circle, school and publication', () => {
  assert.equal(catalog.bySpell.get('fireball').publication, 'Livro do Jogador (2024)');
  assert.equal(
    catalog.bySpell.get('homunculus-servant').publication,
    'Eberron: Forge of the Artificer'
  );
  assert.deepEqual(
    filterSpells(catalog.spells, {
      search: 'EVOCACAO',
      level: '4',
      school: 'Evocation',
      publication: 'Forgotten Realms: Heroes of Faerûn',
    }).map(({ id }) => id),
    ['spellfire-storm']
  );
  assert.deepEqual(
    filterSpells(catalog.spells, { search: 'fireball', level: '3' }).map(({ id }) => id),
    ['fireball']
  );
  assert.deepEqual(
    filterSpells(catalog.spells, { search: 'blade ward', level: '0', school: 'Abjuration' }).map(
      ({ id }) => id
    ),
    ['blade-ward']
  );
});

test('spell details capitalize measures and show the publication', () => {
  assert.match(spellDescription(catalog.bySpell.get('blade-ward')), /<dd>Pessoal<\/dd>/);
  const fireball = spellDescription(catalog.bySpell.get('fireball'));
  assert.match(fireball, /<dd>Instantânea<\/dd>/);
  assert.match(fireball, /<dd>Livro do Jogador \(2024\)<\/dd>/);
});

test('spell descriptions format bold text and escape markup inside it', () => {
  const fireball = catalog.bySpell.get('fireball');
  const rendered = spellDescription(fireball);
  assert.match(rendered, /<strong>Com um espaço de magia de círculo superior\.<\/strong>/);
  assert.match(rendered, /<strong>Using a Higher-Level Spell Slot\.<\/strong>/);
  assert.match(rendered, /<p lang="en"><strong>Fireball<\/strong><\/p>/);
  assert.match(
    spellDescription({ ...fireball, translation: { text: '**<img src=x>**' } }),
    /<strong>&lt;img src=x&gt;<\/strong>/
  );
});

test('Artificer translations preserve the charging, draining and attunement rules', () => {
  const { features } = catalog.byContent.get('artificer');
  const feature = (name) => features.find((item) => item.name === name).translation;
  const tinker = feature('Magic Item Tinker');
  assert.match(tinker.body, /\*\*Recarregar Item Mágico\.\*\*/);
  assert.match(tinker.body, /Qualquer espaço de magia criado dessa forma desaparece/);
  assert.match(feature('Flash of Genius').body, /modificador de Inteligência, com mínimo de \+1/);
  assert.match(feature('Magic Item Adept').body, /até quatro itens mágicos/);
});

test('the Wizard description uses Mago and formats the subclass heading', () => {
  const wizard = catalog.byContent.get('wizard');
  assert.match(wizard.translation.summary, /^Magos /);
  assert.doesNotMatch(wizard.translation.summary, /feiticeir|mágicos/i);
  const tradition = wizard.features.find(({ name }) => name === 'Arcane Tradition');
  assert.match(
    formatDescription(tradition.translation.body),
    /<strong>Subclasses de Mago\.<\/strong>/
  );
  assert.match(formatDescription(tradition.body), /- Bladesinger/);
});

test('picker groups keep the existing spell IDs and respect the eligible spell list', () => {
  const draft = { ...newCharacter('test'), class: 'wizard' };
  const book = projectCharacter(draft, catalog).groups.find(
    ({ key }) => key === 'class/wizard/spellbook/1'
  );
  assert.ok(book.spellPicker);
  assert.ok(
    book.options.some(({ id, name }) => id === 'magic-missile' && name === 'Mísseis Mágicos')
  );
  assert.ok(book.options.every(({ id }) => catalog.bySpell.get(id).level === 1));
});
