import { describe, it, expect } from 'vitest';
import { content } from '@freshmag/one-dndb/data';
import type { ContentItem } from '@freshmag/one-dndb';
import { catalogSlots } from '../src/rules/capabilities.js';
const get = (id: string) =>
  content.find((x) => x.id === id && x.collection === 'classes') as ContentItem;
describe('Capacidades extraídas das tabelas do pacote', () => {
  it('lê espaços de mago sem calcular pelas magias registradas', () => {
    const slots = catalogSlots(get('wizard'), 3);
    expect(slots.state).toBe('known');
    expect(slots.kind).toBe('common');
    expect(slots.slots?.find((x) => x.level === 1)?.maximum).toBe(4);
    expect(slots.slots?.find((x) => x.level === 2)?.maximum).toBe(2);
  });
  it('mantém Pacto separado e lê quantidade e nível do espaço', () => {
    expect(catalogSlots(get('warlock'), 1)).toEqual({
      state: 'known',
      kind: 'pact',
      slots: [{ level: 1, maximum: 1 }],
    });
    expect(catalogSlots(get('warlock'), 5)).toEqual({
      state: 'known',
      kind: 'pact',
      slots: [{ level: 3, maximum: 2 }],
    });
  });
  it('lê conjurador parcial pela tabela própria sem deduzir arredondamentos', () => {
    const result = catalogSlots(get('paladin'), 1);
    expect(result.state).toBe('known');
    expect(result.slots?.[0]).toEqual({ level: 1, maximum: 2 });
  });
  it('não transforma tabela ausente, malformada ou ambígua em zero espaços', () => {
    const wizard = get('wizard');
    expect(catalogSlots({ ...wizard, progression: [] }, 1).state).toBe('unknown');
    expect(catalogSlots(wizard, 21).state).toBe('unknown');
    expect(
      catalogSlots(
        {
          ...wizard,
          progression: [{ heading: 'broken', header: ['Level', '1st'], rows: [['1', '?']] }],
        },
        1
      ).state
    ).toBe('unknown');
    expect(
      catalogSlots(
        {
          ...wizard,
          progression: [
            { heading: 'one', header: ['Level', '1st'], rows: [['1', '2']] },
            { heading: 'two', header: ['Level', '1st'], rows: [['1', '3']] },
          ],
        },
        1
      ).state
    ).toBe('unknown');
  });
});
