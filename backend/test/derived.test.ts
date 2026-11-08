import { describe, it, expect } from 'vitest';
import { modifier, proficiencyBonus, armorFormula } from '../src/rules/derived.js';
describe('Fórmulas derivadas D&D 2024', () => {
  it('arredonda modificadores negativos para baixo', () => {
    expect([1, 3, 9, 10, 13, 20, 30].map(modifier)).toEqual([-5, -4, -1, 0, 1, 5, 10]);
  });
  it('usa todas as faixas de nível total', () => {
    expect(Array.from({ length: 20 }, (_, i) => proficiencyBonus(i + 1))).toEqual([
      2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
    ]);
    for (const invalid of [0, 21, 1.5, NaN]) expect(() => proficiencyBonus(invalid)).toThrow();
  });
  it('limita apenas o bônus positivo da armadura média, sem apagar penalidades', () => {
    expect(armorFormula('14 + Dex modifier (max 2)', 5)).toBe(16);
    expect(armorFormula('14 + Dex modifier (max 2)', -2)).toBe(12);
    expect(armorFormula('11 + Dex modifier', 5)).toBe(16);
    expect(armorFormula('16', 5)).toBe(16);
  });
  it('recusa texto e fórmulas não reconhecidas sem executar dados externos', () => {
    for (const value of [undefined, '+2', '10 + Wis modifier', 'process.exit()', '16 arbitrary'])
      expect(armorFormula(value, 2)).toBeNull();
  });
});
