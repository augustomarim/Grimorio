import { describe, expect, it } from 'vitest';
import { multiclassRequirements } from '../src/rules/multiclass.js';

const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const scores = (score: number) => Object.fromEntries(abilities.map((a) => [a, score]));
const check = (slugs: string[], attributes: Record<string, unknown>) =>
  multiclassRequirements(
    slugs.map((slug, i) => ({ id: i + 1, slug })),
    attributes
  );

describe('Pré-requisitos normativos de multiclasse 2024', () => {
  it.each([
    ['barbarian', 'strength'],
    ['bard', 'charisma'],
    ['cleric', 'wisdom'],
    ['druid', 'wisdom'],
    ['rogue', 'dexterity'],
    ['sorcerer', 'charisma'],
    ['warlock', 'charisma'],
    ['wizard', 'intelligence'],
  ])('%s exige 13 em %s inclusive quando é a classe inicial', (slug, ability) => {
    const other = slug === 'wizard' ? 'cleric' : 'wizard';
    expect(check([slug, other], { ...scores(13), [ability]: 12 }).state).toBe('fail');
    expect(check([other, slug], { ...scores(13), [ability]: 12 }).state).toBe('fail');
    expect(check([slug, other], scores(13)).state).toBe('pass');
  });
  it.each(['monk', 'ranger', 'paladin'])('%s exige ambos os atributos', (slug) => {
    const pair = slug === 'paladin' ? ['strength', 'charisma'] : ['dexterity', 'wisdom'];
    for (const ability of pair)
      expect(check(['wizard', slug], { ...scores(13), [ability]: 12 }).state).toBe('fail');
    expect(check(['wizard', slug], scores(13)).state).toBe('pass');
  });
  it('guerreiro aceita Força OU Destreza, sem exigir ambas', () => {
    for (const ability of ['strength', 'dexterity'])
      expect(
        check(['wizard', 'fighter'], { ...scores(12), intelligence: 13, [ability]: 13 }).state
      ).toBe('pass');
    expect(check(['fighter', 'wizard'], { ...scores(12), intelligence: 13 }).state).toBe('fail');
  });
  it('verifica todas as classes, não só a primeira e a última', () => {
    expect(check(['wizard', 'barbarian', 'cleric'], { ...scores(13), strength: 12 }).state).toBe(
      'fail'
    );
  });
  it('não impõe mínimo 13 em ficha de classe única', () => {
    expect(check(['paladin'], scores(8)).state).toBe('pass');
  });
  it('preserva desconhecido para suplementos e atributos ausentes', () => {
    expect(check(['wizard', 'artificer'], scores(20)).state).toBe('unknown');
    expect(check(['wizard', 'cleric'], {}).state).toBe('unknown');
    expect(check(['wizard', 'constructor'], scores(20)).state).toBe('unknown');
    expect(check(['wizard', 'cleric'], { ...scores(13), wisdom: Infinity }).state).toBe('unknown');
    expect(check(['wizard', 'artificer'], scores(12)).state).toBe('fail');
  });
});
