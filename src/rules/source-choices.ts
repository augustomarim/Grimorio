import type { ContentItem, ItemChoice } from '@freshmag/one-dndb';
export const magicInitiateChoice = 'app:magic-initiate';
export const featSpellEffectsChoice = 'app:feat-spells';
const lists = ['cleric', 'druid', 'wizard'] as const;
const abilities = ['intelligence', 'wisdom', 'charisma'] as const;
interface Source {
  data: ContentItem;
  featSlug: string | null;
  magicInitiateListConstraint: string | null;
}
export function magicConfiguration(choiceId: string, optionId: string) {
  if (choiceId !== magicInitiateChoice) return;
  const [list, ability, ...extra] = optionId.split(':');
  if (extra.length || !lists.some((x) => x === list) || !abilities.some((x) => x === ability))
    return;
  return { list: list!, ability: ability! };
}
// Application projection of direct Feat.effects.spellChoices; not a new package API.
// SRD 5.2 p. 87: one shared list and casting ability for this occurrence of Magic Initiate.
export function sourceChoices(source: Source): ItemChoice[] {
  const existing = source.data.choices ?? [];
  if (!source.featSlug) return existing;
  if (source.featSlug !== 'magic-initiate') {
    const spellChoices = source.data.spellChoices ?? [],
      spellsFixed = source.data.spellsFixed ?? [];
    if (!spellChoices.length && !spellsFixed.length) return existing;
    return [
      ...existing,
      {
        id: featSpellEffectsChoice,
        name: 'Spells granted by feat',
        pick: 1,
        options: [{ id: 'catalog', name: 'Catalog spell effects', spellChoices, spellsFixed }],
      },
    ];
  }
  const rules = source.data.spellChoices ?? [];
  const cantrips = rules.find((r) => r.id === 'two-cantrips'),
    spell = rules.find((r) => r.id === 'level-1-spell');
  if (
    !cantrips ||
    !spell ||
    cantrips.pick !== 2 ||
    cantrips.spellLevel !== 0 ||
    spell.pick !== 1 ||
    spell.spellLevel !== 1
  )
    return existing;
  const available = lists.filter(
    (list) =>
      (!source.magicInitiateListConstraint || list === source.magicInitiateListConstraint) &&
      [cantrips, spell].every((r) => !r.lists || r.lists.includes(list))
  );
  return [
    ...existing,
    {
      id: magicInitiateChoice,
      name: 'Magic Initiate: spell list and ability',
      pick: 1,
      identity: true,
      options: available.flatMap((list) =>
        abilities.map((ability) => ({
          id: `${list}:${ability}`,
          name: `${list} / ${ability}`,
          spellChoices: [cantrips, spell].map((rule) => {
            const { lists: _, ...rest } = rule;
            return { ...rest, list };
          }),
        }))
      ),
    },
  ];
}
