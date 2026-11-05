import { describe, it, expect } from 'vitest';
import {
  combinedSlots,
  entryBenefits,
  type CastingClass,
} from '../src/rules/multiclass-progression.js';
const cls = (slug: string, level: number, id = 1, spellcasting = true): CastingClass => ({
  id,
  slug,
  level,
  spellcasting,
  subclassCasting: false,
  individual: { state: 'known', kind: 'common', slots: [{ level: 1, maximum: 2 }] },
});
describe('SRD 5.2 — capacidades multiclasse confirmadas no PDF', () => {
  it('reproduz o exemplo oficial Ranger 4 / Sorcerer 3', () => {
    const result = combinedSlots([cls('ranger', 4), cls('sorcerer', 3, 2)]);
    expect(result.effectiveCasterLevel).toBe(5);
    expect(result.slots?.slice(0, 3)).toEqual([
      { level: 1, maximum: 4 },
      { level: 2, maximum: 3 },
      { level: 3, maximum: 2 },
    ]);
  });
  it('soma as três classes conjuradoras sem usar o nível de uma subclasse', () => {
    const result = combinedSlots([cls('wizard', 3), cls('cleric', 4, 2), cls('sorcerer', 3, 3)]);
    expect(result.effectiveCasterLevel).toBe(10);
    expect(result.slots?.map((s) => s.maximum)).toEqual([4, 3, 3, 3, 2, 0, 0, 0, 0]);
  });
  it('arredonda contribuições parciais para cima e não arredonda o total final', () => {
    expect(combinedSlots([cls('paladin', 3), cls('wizard', 1, 2)]).effectiveCasterLevel).toBe(3);
    expect(combinedSlots([cls('paladin', 3), cls('ranger', 3, 2)]).effectiveCasterLevel).toBe(4);
  });
  it('usa a regra individual com apenas uma classe Spellcasting, excluindo Pacto e classes marciais', () => {
    const wizard = cls('wizard', 1);
    expect(
      combinedSlots([wizard, cls('warlock', 5, 2, false), cls('fighter', 1, 3, false)]).slots
    ).toEqual(wizard.individual.slots);
    expect(combinedSlots([cls('warlock', 5, 1, false)])).toEqual({ state: 'known', slots: [] });
  });
  it('confere a última linha da tabela e mantém suplementos e subclasses fora da fórmula confirmada', () => {
    expect(
      combinedSlots([cls('wizard', 10), cls('cleric', 10, 2)]).slots?.map((s) => s.maximum)
    ).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    expect(combinedSlots([cls('artificer', 3), cls('wizard', 2, 2)]).state).toBe('unknown');
    expect(
      combinedSlots([{ ...cls('fighter', 3), subclassCasting: true }, cls('wizard', 2, 2)]).state
    ).toBe('unknown');
  });
  it('todas as 12 entradas básicas excluem salvaguardas e equipamento inicial', () => {
    for (const slug of [
      'barbarian',
      'bard',
      'cleric',
      'druid',
      'fighter',
      'monk',
      'paladin',
      'ranger',
      'rogue',
      'sorcerer',
      'warlock',
      'wizard',
    ]) {
      const entry = entryBenefits(slug)!;
      expect(entry.savingThrows).toEqual([]);
      expect(entry.startingEquipment).toBe(false);
      expect(entry.levelOneFeatures).toBe(true);
    }
  });
  it('distingue armaduras e armas das classes iniciais', () => {
    expect(entryBenefits('fighter')?.armorTraining).toEqual([
      { kind: 'Light' },
      { kind: 'Medium' },
      { kind: 'Shield' },
    ]);
    expect(entryBenefits('fighter')?.weaponTraining).toEqual([{ category: 'Martial' }]);
    expect(entryBenefits('barbarian')?.armorTraining).toEqual([{ kind: 'Shield' }]);
    expect(entryBenefits('monk')?.armorTraining).toEqual([]);
    expect(entryBenefits('monk')?.toolsFixed).toEqual([]);
    expect(entryBenefits('druid')?.toolsFixed).toEqual([]);
    expect(entryBenefits('warlock')?.armorTraining).toEqual([{ kind: 'Light' }]);
  });
  it('limita Bardo a uma perícia e um instrumento, e Ladino/Patrulheiro a uma perícia da lista correta', () => {
    expect(entryBenefits('bard')?.skillChoices[0]?.pick).toBe(1);
    expect(entryBenefits('bard')?.toolChoices[0]).toMatchObject({ pick: 1, group: 'instrument' });
    expect(entryBenefits('rogue')?.toolsFixed).toEqual(['thieves-tools']);
    expect(entryBenefits('rogue')?.skillChoices[0]?.from).toContain('Sleight of Hand');
    expect(entryBenefits('ranger')?.skillChoices[0]?.from).toContain('Survival');
    expect(entryBenefits('ranger')?.skillChoices[0]?.pick).toBe(1);
  });
  it('não inventa dados para Artificer ou nomes desconhecidos', () => {
    expect(entryBenefits('artificer')).toBeUndefined();
    expect(entryBenefits('constructor')).toBeUndefined();
  });
});
