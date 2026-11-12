import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as raw from '@freshmag/one-dndb/data';
import {
  availableSpellChoices,
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

test('Magic Initiate reserves its spells before the Wizard chooses cantrips and spellbook entries', () => {
  const draft = { ...newCharacter('test'), species: 'human', class: 'wizard' };
  const feat = build(draft).groups.find(({ key }) => key.endsWith('/versatile'));
  const config = `${feat.key}/magic-initiate/magic-initiate`;
  const bookKey = 'class/wizard/spellbook/1';
  const cantripKey = 'class/wizard/spell/class-cantrips';
  Object.assign(draft.selected, {
    [feat.key]: ['magic-initiate'],
    [config]: ['wizard:int'],
    [`${config}/wizard:int/spell/level-1-spell`]: ['alarm'],
    [`${config}/wizard:int/spell/two-cantrips`]: ['light', 'mage-hand'],
    [bookKey]: ['alarm'],
    [cantripKey]: ['light'],
  });
  const character = build(draft);
  assert.deepEqual(character.validSelections[bookKey], []);
  assert.deepEqual(character.validSelections[cantripKey], []);
  assert.ok(!character.groups.find(({ key }) => key === bookKey).options.some(({ id }) => id === 'alarm'));
  assert.deepEqual(
    character.spells.filter(({ id }) => id === 'alarm').map(({ free }) => free),
    [{ uses: 1, per: 'long' }]
  );
});

test('the origin picker hides a spell already selected in the class tab', () => {
  const draft = { ...newCharacter('test'), species: 'human', class: 'wizard' };
  const feat = build(draft).groups.find(({ key }) => key.endsWith('/versatile'));
  const config = `${feat.key}/magic-initiate/magic-initiate`;
  draft.selected = {
    [feat.key]: ['magic-initiate'],
    [config]: ['wizard:int'],
    'class/wizard/spellbook/1': ['alarm'],
  };
  const character = build(draft);
  const group = character.groups.find(({ key }) => key === `${config}/wizard:int/spell/level-1-spell`);
  assert.ok(group.options.some(({ id }) => id === 'alarm'));
  const available = availableSpellChoices(group, character.spells);
  assert.ok(!available.options.some(({ id }) => id === 'alarm'));
  assert.ok(available.options.some(({ id }) => id === 'magic-missile'));
});

test('Draconic Sorcery grants Chromatic Orb without consuming a Sorcerer spell choice', () => {
  const key = 'class/sorcerer/learned-spells/1';
  const character = build({
    ...newCharacter('test'),
    class: 'sorcerer',
    level: 3,
    selected: {
      'class/sorcerer/subclass': ['draconic-sorcery'],
      [key]: ['chromatic-orb'],
    },
  });
  assert.deepEqual(character.validSelections[key], []);
  assert.ok(character.spells.some(({ id, preparation }) => id === 'chromatic-orb' && preparation === 'always'));
});

test('Gloom Stalker grants Wisdom saves or offers an alternative if already proficient', () => {
  const draft = {
    ...newCharacter('test'),
    class: 'ranger',
    level: 7,
    selected: { 'class/ranger/subclass': ['gloom-stalker'] },
  };
  const key = 'subclass/gloom-stalker/saving-throw';
  const ranger = build(draft);
  assert.ok(ranger.savingThrows.has('wis'));
  assert.equal(ranger.validSelections[key], undefined);

  draft.classPlan = ['cleric', ...Array(7).fill('ranger')];
  const multiclass = build(draft);
  assert.deepEqual(multiclass.groups.find((group) => group.key === key).options.map(({ id }) => id), ['int']);
  draft.selected[key] = ['int'];
  assert.ok(build(draft).savingThrows.has('int'));
});

test('a Sorcerer can replace an earlier Metamagic without gaining an extra option', () => {
  const key = 'class/sorcerer/metamagic';
  const character = build({
    ...newCharacter('test'),
    class: 'sorcerer',
    level: 3,
    selected: {
      [`${key}/2`]: ['Careful Spell', 'Distant Spell'],
      [`${key}/3/replace`]: ['Careful Spell'],
      [`${key}/3/replace/Careful Spell/replacement`]: ['Subtle Spell'],
    },
  });
  assert.deepEqual(character.selectedFeatures.map(({ id }) => id), ['Distant Spell', 'Subtle Spell']);
});

test('a Warlock can trade an invocation for Pact of the Tome and loses the former benefit', () => {
  const key = 'class/warlock/replace-invocation/2';
  const character = build({
    ...newCharacter('test'),
    class: 'warlock',
    level: 2,
    selected: {
      'class/warlock/invocation/1': ['Armor of Shadows'],
      [key]: ['Armor of Shadows'],
      [`${key}/Armor of Shadows/replacement`]: ['Pact of the Tome'],
    },
  });
  assert.ok(character.selectedFeatures.some(({ id }) => id === 'Pact of the Tome'));
  assert.ok(!character.selectedFeatures.some(({ id }) => id === 'Armor of Shadows'));
  assert.ok(!character.spells.some(({ id }) => id === 'mage-armor'));
  assert.ok(character.groups.some(({ key }) => key.endsWith('/spell/tome-cantrips')));
});

test('a Warlock cannot replace a pact required by another known invocation', () => {
  const character = build({
    ...newCharacter('test'),
    class: 'warlock',
    level: 5,
    selected: {
      'class/warlock/invocation/1': ['Pact of the Blade'],
      'class/warlock/invocation/5': ['Thirsting Blade'],
    },
  });
  assert.ok(character.selectedFeatures.some(({ id }) => id === 'Thirsting Blade'));
  const swap = character.groups.find(({ key }) => key === 'class/warlock/replace-invocation/5');
  assert.ok(!swap?.options.some(({ id }) => id === 'Pact of the Blade'));
});

test('class cantrip replacements preserve level history and migrate existing picks', () => {
  const start = 'class/sorcerer/spell/class-cantrips';
  const swap = 'class/sorcerer/replace-cantrip/2';
  const draft = {
    ...newCharacter('test'),
    class: 'sorcerer',
    level: 4,
    selected: {
      [start]: ['light', 'mage-hand', 'shocking-grasp', 'prestidigitation', 'fire-bolt'],
      [swap]: ['light'],
      [`${swap}/light/replacement`]: ['minor-illusion'],
    },
  };
  const character = build(draft);
  assert.deepEqual(character.validSelections[`${start}/4`], ['fire-bolt']);
  assert.ok(character.spells.some(({ id }) => id === 'minor-illusion'));
  assert.ok(!character.spells.some(({ id }) => id === 'light'));
  assert.ok(build({ ...draft, level: 1 }).spells.some(({ id }) => id === 'light'));
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
