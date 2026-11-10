import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as raw from '@freshmag/one-dndb/data';
import {
  canAdjustScore,
  displayName,
  indexCatalog,
  newCharacter,
  pointsSpent,
  projectCharacter,
  rollAbilityScore,
  unmetMulticlassRequirements,
} from './rules.js';

const catalog = indexCatalog({ ...raw, languagePick: raw.reference.languagePick });
const build = (draft) => projectCharacter(draft, catalog);

test('every catalog species, class and subclass can be opened with its features', () => {
  assert.deepEqual(
    [catalog.species.length, catalog.classes.length, catalog.subclasses.length],
    [25, 13, 76]
  );
  for (const entry of catalog.species) {
    const character = build({ ...newCharacter('test'), species: entry.id });
    assert.equal(character.species, entry);
    assert.deepEqual(
      character.features.map(({ name }) => name),
      entry.traits.map(({ name }) => name)
    );
  }
  for (const entry of catalog.classes) {
    const character = build({ ...newCharacter('test'), class: entry.id });
    assert.equal(character.cls, entry);
    assert.ok(character.features.length > 0, entry.id);
    assert.ok(
      character.features.every(({ level }) => level === 1),
      entry.id
    );
    if (entry.id === 'monk') {
      const training = character.groups.find(({ key }) => key === 'class/monk/tool/training');
      assert.ok(training.options.some(({ id }) => id === 'tool:lute'));
      assert.ok(training.options.some(({ id }) => id === 'tool:alchemists-supplies'));
    }
  }
  for (const entry of catalog.subclasses) {
    const cls = catalog.classes.find(({ name }) => name === entry.class);
    const key = `class/${cls.id}/subclass`;
    const draft = {
      ...newCharacter('test'),
      class: cls.id,
      level: 20,
      selected: { [key]: [entry.id] },
    };
    assert.equal(build(draft).subclass, entry);
    assert.equal(build({ ...draft, level: cls.subclassLevel - 1 }).subclass, undefined);
  }
});

test('Human origin feat expands to one spell list with two eligible cantrips', () => {
  const draft = { ...newCharacter('test'), species: 'human' };
  const first = build(draft);
  const skill = first.groups.find(({ key }) => key.endsWith('/skillful'));
  assert.equal(skill.count, 1);
  assert.equal(skill.options.length, 18);
  assert.equal(displayName(skill.options.find(({ id }) => id === 'skill:Stealth')), 'Furtividade');
  assert.ok(first.features.some(({ name }) => name === 'Resourceful'));
  const feat = first.groups.find(({ key }) => key.endsWith('/versatile'));
  const config = `${feat.key}/magic-initiate/magic-initiate`;
  draft.selected[feat.key] = ['magic-initiate'];
  draft.selected[config] = ['druid:wis'];
  const expanded = build(draft);
  const cantrips = expanded.groups.find(({ key }) => key.endsWith('/two-cantrips'));
  assert.equal(cantrips.count, 2);
  assert.ok(cantrips.options.some(({ id }) => id === 'guidance'));
  assert.ok(cantrips.options.every(({ id }) => catalog.bySpell.get(id).classes.includes('druid')));
  assert.equal(build({ ...draft, species: 'dwarf' }).validSelections[config], undefined);
});

test('point buy respects score bounds and the variable cost near the budget', () => {
  const scores = { str: 15, dex: 15, con: 13, int: 12, wis: 8, cha: 8 };
  assert.equal(pointsSpent(scores), 27);
  assert.equal(canAdjustScore(scores, 'con', 1), false);
  assert.equal(canAdjustScore(scores, 'wis', -1), false);
  assert.equal(canAdjustScore(scores, 'str', -1), true);
  scores.str = 14;
  assert.equal(canAdjustScore(scores, 'con', 1), true);
  assert.equal(canAdjustScore({ ...scores, str: 15, dex: 14 }, 'str', 1), false);
  assert.equal(canAdjustScore({ ...scores, str: 15, dex: 15, int: 13 }, 'int', -1), true);
});

test('rolling four d6 drops exactly one lowest die, including ties', () => {
  const values = [0.99, 0, 0.18, 0];
  assert.deepEqual(
    rollAbilityScore(() => values.shift()),
    {
      dice: [6, 1, 2, 1],
      discarded: 1,
      score: 9,
    }
  );
});

test('Ranger style grants independent cantrip choices from level two', () => {
  const key = 'class/ranger/choice/fighting-style';
  const draft = {
    ...newCharacter('test'),
    class: 'ranger',
    level: 2,
    selected: { [key]: ['druidic-warrior'] },
  };
  const character = build(draft);
  const cantrips = character.groups.find((group) =>
    group.key.startsWith(key + '/druidic-warrior/spell/')
  );
  assert.equal(cantrips.count, 2);
  assert.ok(cantrips.options.every(({ id }) => catalog.bySpell.get(id).level === 0));
  assert.equal(build({ ...draft, level: 1 }).validSelections[key], undefined);
});

test('Wizard preparation is drawn from the selected spellbook and excludes cantrips', () => {
  const draft = { ...newCharacter('test'), class: 'wizard' };
  const book = build(draft).groups.find(({ key }) => key === 'class/wizard/spellbook/1');
  assert.equal(book.count, 6);
  draft.selected[book.key] = book.options.slice(0, book.count).map(({ id }) => id);
  const prepared = build(draft).groups.find(({ key }) => key.endsWith('/class-prepared'));
  assert.equal(prepared.count, 4);
  assert.deepEqual(
    prepared.options.map(({ id }) => id),
    draft.selected[book.key]
  );
  assert.ok(prepared.options.every(({ id }) => catalog.bySpell.get(id).level === 1));
});

test('multiclass advancement uses class levels and keeps starting benefits exclusive', () => {
  const draft = { ...newCharacter('test'), classPlan: ['wizard', 'rogue', 'wizard'] };
  const character = build(draft);
  assert.deepEqual(
    character.classes.map(({ entry, levels }) => [entry.id, levels]),
    [
      ['wizard', [1, 3]],
      ['rogue', [2]],
    ]
  );
  assert.ok(
    character.groups.some(
      (group) =>
        group.key === 'class/wizard/spellbook/2' && group.level === 2 && group.characterLevel === 3
    )
  );
  assert.ok(
    character.groups.some(
      (group) =>
        group.key.startsWith('class/rogue/skill/multiclass-training') &&
        group.count === 1 &&
        group.characterLevel === 2
    )
  );
  assert.ok(character.tools.has('thieves-tools'));
  assert.ok(!character.groups.some(({ key }) => key === 'class/rogue/choice/equipment'));
  assert.ok(
    !character.facts.some(
      ({ source, name }) => source === 'Ladino' && name === 'Salvaguardas proficientes'
    )
  );
  assert.ok(!character.groups.some(({ key }) => key.endsWith('/subclass')));
  assert.deepEqual(unmetMulticlassRequirements(character.classes, character.scores), [
    'Mago precisa de 13 em Inteligência',
  ]);
  assert.deepEqual(
    unmetMulticlassRequirements(character.classes, { ...character.scores, int: 13 }),
    []
  );
});

test('existing single-class drafts retain their level and their stored subclass choices', () => {
  const draft = {
    ...newCharacter('legacy'),
    class: 'wizard',
    level: 3,
    selected: { 'class/wizard/subclass': ['diviner'] },
  };
  const character = build(draft);
  assert.deepEqual(character.classes[0].levels, [1, 2, 3]);
  assert.equal(character.classes[0].subclass.id, 'diviner');
  assert.deepEqual(character.validSelections['class/wizard/subclass'], ['diviner']);
});

test('setting-specific backgrounds make their required origin feat available', () => {
  for (const background of ['mist-wanderer', 'spirit-medium']) {
    const draft = { ...newCharacter('test'), background };
    const feat = build(draft).groups.find(({ key }) => key.endsWith('/feat/origin-feat'));
    assert.ok(
      feat.options.some(({ category }) => category === 'Dark Gift'),
      background
    );
  }
});

test('Warlock invocations are gated by level and open nested Pact of the Tome spells', () => {
  const key = 'class/warlock/invocation/1';
  const draft = {
    ...newCharacter('test'),
    class: 'warlock',
    selected: { [key]: ['Pact of the Tome'] },
  };
  const first = build(draft);
  assert.equal(first.groups.filter((group) => /\/invocation\/\d+$/.test(group.key)).length, 1);
  assert.ok(
    !first.groups.find((group) => group.key === key).options.some(({ id }) => id === 'Witch Sight')
  );
  const rituals = first.groups.find(({ key }) => key.endsWith('/tome-rituals'));
  assert.equal(rituals.count, 2);
  assert.ok(
    rituals.options.every(
      ({ id }) => catalog.bySpell.get(id).level === 1 && catalog.bySpell.get(id).ritual
    )
  );
  const second = build({ ...draft, level: 2 });
  assert.equal(second.groups.filter((group) => /\/invocation\/\d+$/.test(group.key)).length, 3);
});
