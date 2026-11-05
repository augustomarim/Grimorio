import type { Slots, SlotResult } from './capabilities.js';
// SRD 5.2, printed pp. 25–26. This is a rule table, not catalog-derived heuristics.
const slotsByLevel: readonly (readonly number[])[] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const full = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
const half = new Set(['paladin', 'ranger']);
export interface CastingClass {
  id: number;
  slug: string;
  level: number;
  spellcasting: boolean;
  subclassCasting: boolean;
  individual: SlotResult;
}
export function combinedSlots(classes: readonly CastingClass[]): {
  state: 'known' | 'unknown';
  slots: Slots[] | null;
  effectiveCasterLevel?: number;
  reason?: string;
  contributions?: { characterClassId: number; effectiveLevels: number }[];
} {
  const spellcasters = classes.filter((c) => c.spellcasting);
  if (!spellcasters.length) return { state: 'known', slots: [] };
  if (spellcasters.length === 1) {
    const only = spellcasters[0]!;
    return { state: only.individual.state, slots: only.individual.slots };
  }
  if (spellcasters.some((c) => c.subclassCasting || (!full.has(c.slug) && !half.has(c.slug))))
    return {
      state: 'unknown',
      slots: null,
      reason: 'Contribuição de suplemento ou subclasse não coberta pelo SRD 5.2 consultado',
    };
  const contributions = spellcasters.map((c) => ({
    characterClassId: c.id,
    effectiveLevels: half.has(c.slug) ? Math.ceil(c.level / 2) : c.level,
  }));
  const total = contributions.reduce((n, c) => n + c.effectiveLevels, 0),
    row = slotsByLevel[total - 1];
  if (!row || total < 1 || total > 20)
    return { state: 'unknown', slots: null, reason: 'Nível efetivo fora da tabela' };
  return {
    state: 'known',
    effectiveCasterLevel: total,
    contributions,
    slots: row.map((maximum, i) => ({ level: i + 1, maximum })),
  };
}
export interface EntryBenefits {
  hitDie: number;
  savingThrows: string[];
  armorTraining: { kind: 'Light' | 'Medium' | 'Heavy' | 'Shield' }[];
  weaponTraining: { category: 'Martial' }[];
  toolsFixed: string[];
  skillChoices: { id: string; name: string; pick: number; from?: string[] }[];
  toolChoices: { id: string; name: string; pick: number; group: string }[];
  page: number;
  levelOneFeatures: true;
  startingEquipment: false;
}
// SRD 5.2, each class's “As a Multiclass Character” subsection. Only the starting traits.
const definitions: Record<
  string,
  {
    die: number;
    armor: EntryBenefits['armorTraining'][number]['kind'][];
    martial?: boolean;
    skill?: 'any' | 'ranger' | 'rogue';
    instrument?: boolean;
    tools?: string[];
    page: number;
  }
> = {
  barbarian: { die: 12, armor: ['Shield'], martial: true, page: 28 },
  bard: { die: 8, armor: ['Light'], skill: 'any', instrument: true, page: 31 },
  cleric: { die: 8, armor: ['Light', 'Medium', 'Shield'], page: 36 },
  druid: { die: 8, armor: ['Light', 'Shield'], page: 41 },
  fighter: { die: 10, armor: ['Light', 'Medium', 'Shield'], martial: true, page: 47 },
  monk: { die: 8, armor: [], page: 49 },
  paladin: { die: 10, armor: ['Light', 'Medium', 'Shield'], martial: true, page: 53 },
  ranger: {
    die: 10,
    armor: ['Light', 'Medium', 'Shield'],
    martial: true,
    skill: 'ranger',
    page: 57,
  },
  rogue: { die: 8, armor: ['Light'], skill: 'rogue', tools: ['thieves-tools'], page: 61 },
  sorcerer: { die: 6, armor: [], page: 64 },
  warlock: { die: 8, armor: ['Light'], page: 70 },
  wizard: { die: 6, armor: [], page: 77 },
};
const skillLists = {
  ranger: [
    'Animal Handling',
    'Athletics',
    'Insight',
    'Investigation',
    'Nature',
    'Perception',
    'Stealth',
    'Survival',
  ],
  rogue: [
    'Acrobatics',
    'Athletics',
    'Deception',
    'Insight',
    'Intimidation',
    'Investigation',
    'Perception',
    'Persuasion',
    'Sleight of Hand',
    'Stealth',
  ],
};
export function entryBenefits(slug: string): EntryBenefits | undefined {
  const d = Object.hasOwn(definitions, slug) ? definitions[slug] : undefined;
  if (!d) return;
  return {
    hitDie: d.die,
    savingThrows: [],
    armorTraining: d.armor.map((kind) => ({ kind })),
    weaponTraining: d.martial ? [{ category: 'Martial' }] : [],
    toolsFixed: [...(d.tools ?? [])],
    skillChoices: d.skill
      ? [
          {
            id: 'multiclass-training',
            name: 'Multiclass Skill Proficiency',
            pick: 1,
            ...(d.skill === 'any' ? {} : { from: [...skillLists[d.skill]] }),
          },
        ]
      : [],
    toolChoices: d.instrument
      ? [
          {
            id: 'multiclass-instrument',
            name: 'Multiclass Musical Instrument',
            pick: 1,
            group: 'instrument',
          },
        ]
      : [],
    page: d.page,
    levelOneFeatures: true,
    startingEquipment: false,
  };
}

// Explicit application key separates core starting traits from level-one features.
export const coreEntryKey = (characterClassId: number) => `multiclass-core:${characterClassId}`;
