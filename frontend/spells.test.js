import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as raw from '@freshmag/one-dndb/data';
import { indexCatalog, newCharacter, projectCharacter } from './rules.js';
import { spellEffects } from './spells.js';

const locale = JSON.parse(readFileSync(new URL('./pt-BR.json', import.meta.url), 'utf8'));
const catalog = indexCatalog({ ...raw, revision: raw.REVISION }, locale);
const effects = (id) => Object.fromEntries(spellEffects(catalog.bySpell.get(id)));

test('the catalog has translations for every spell, trait and class feature', () => {
  assert.equal(locale.revision, raw.REVISION);
  for (const spell of catalog.spells) {
    assert.ok(spell.translation?.name && spell.translation?.text, spell.id);
    for (const [dice] of spell.text.matchAll(/\b\d+d\d+\b/gi)) {
      assert.ok(
        spell.translation.text.toLowerCase().includes(dice.toLowerCase()),
        `${spell.id}: ${dice}`
      );
    }
  }
  for (const entry of catalog.content) {
    for (const feature of [...(entry.traits ?? []), ...(entry.features ?? [])]) {
      assert.ok(
        feature.translation?.name && feature.translation?.body,
        `${entry.id}: ${feature.name}`
      );
    }
  }
});

test('spell effects keep base damage, saving throws and healing separate', () => {
  assert.deepEqual(effects('fireball'), { Dano: '8d6 de fogo', Resistência: 'Destreza' });
  assert.deepEqual(effects('acid-splash'), { Dano: '1d6 de ácido', Resistência: 'Destreza' });
  assert.deepEqual(effects('cure-wounds'), { Cura: '2d8 + modificador de conjuração' });
  assert.deepEqual(effects('guidance'), {});
  assert.match(effects('chromatic-orb').Dano, /3d8 do tipo escolhido/);
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
