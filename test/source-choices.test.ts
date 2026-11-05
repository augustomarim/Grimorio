import { describe, it, expect } from 'vitest';
import { feats } from '@freshmag/one-dndb/data';
import type { ContentItem } from '@freshmag/one-dndb';
import {
  sourceChoices,
  magicConfiguration,
  magicInitiateChoice,
} from '../src/rules/source-choices.js';
const data = feats.find((f) => f.id === 'magic-initiate')!.effects as ContentItem;
const source = { data, featSlug: 'magic-initiate', magicInitiateListConstraint: null };
describe('Projeção local de escolhas diretas, sem modificar o catálogo', () => {
  it('preserva regras do pacote e projeta nove configurações coerentes', () => {
    const before = JSON.stringify(data),
      options = sourceChoices(source)[0]!.options;
    expect(options).toHaveLength(9);
    expect(
      options.find((o) => o.id === 'wizard:intelligence')!.spellChoices!.map((r) => r.list)
    ).toEqual(['wizard', 'wizard']);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('não cria regras quando a forma esperada ou a qualificação não é reconhecida', () => {
    expect(sourceChoices({ ...source, data: { ...data, spellChoices: [] } })).toEqual([]);
    expect(
      sourceChoices({ ...source, magicInitiateListConstraint: 'unrecognized' })[0]!.options
    ).toEqual([]);
    expect(sourceChoices({ ...source, featSlug: 'other-feat' })).toEqual([]);
  });
  it('recusa ids e atributos fora da configuração confirmada', () => {
    expect(magicConfiguration(magicInitiateChoice, 'wizard:intelligence')).toEqual({
      list: 'wizard',
      ability: 'intelligence',
    });
    for (const value of [
      'wizard:strength',
      'sorcerer:charisma',
      'wizard:intelligence:extra',
      '__proto__:wisdom',
    ])
      expect(magicConfiguration(magicInitiateChoice, value)).toBeUndefined();
  });
});
