import type { Finding } from './validation.js';
export const multiclassSources = [
  'https://www.dndbeyond.com/sources/dnd/free-rules/creating-a-character#Multiclassing',
  'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf',
] as const;
// SRD 5.2, pp. 24–25 and the Core Class Traits tables in Classes.
// Each inner array is OR; the outer array is AND. Never infer these
// operators from the external catalog's primaryAbility field.
const prerequisites: Record<string, readonly (readonly string[])[]> = {
  barbarian: [['strength']],
  bard: [['charisma']],
  cleric: [['wisdom']],
  druid: [['wisdom']],
  fighter: [['strength', 'dexterity']],
  monk: [['dexterity'], ['wisdom']],
  paladin: [['strength'], ['charisma']],
  ranger: [['dexterity'], ['wisdom']],
  rogue: [['dexterity']],
  sorcerer: [['charisma']],
  warlock: [['charisma']],
  wizard: [['intelligence']],
};
export function multiclassRequirements(
  classes: readonly {
    id: number;
    slug: string;
  }[],
  attributes: Record<string, unknown>
): Finding {
  const checks =
    classes.length > 1
      ? classes.map((cls) => {
          const clauses = Object.hasOwn(prerequisites, cls.slug)
            ? prerequisites[cls.slug]
            : undefined;
          const results = clauses?.map((alternatives) => {
            const scores = alternatives.map((ability) => ({ ability, score: attributes[ability] }));
            const state = scores.some(
              (s) => typeof s.score === 'number' && Number.isFinite(s.score) && s.score >= 13
            )
              ? 'pass'
              : scores.some((s) => typeof s.score !== 'number' || !Number.isFinite(s.score))
                ? 'unknown'
                : 'fail';
            return { alternatives: scores, state };
          });
          const state = !results
            ? 'unknown'
            : results.some((r) => r.state === 'fail')
              ? 'fail'
              : results.some((r) => r.state === 'unknown')
                ? 'unknown'
                : 'pass';
          return { entityId: cls.id, class: cls.slug, state, clauses: results ?? null };
        })
      : [];
  return {
    code: 'MULTICLASS_REQUIREMENTS',
    state: checks.some((c) => c.state === 'fail')
      ? 'fail'
      : checks.some((c) => c.state === 'unknown')
        ? 'unknown'
        : 'pass',
    message:
      classes.length > 1
        ? 'Pré-requisitos de atributos de todas as classes no estado atual, incluindo a inicial; não comprova atributos na aquisição'
        : 'Ficha sem multiclasse; mínimo 13 não se aplica',
    evidence: { minimumScore: 13, sources: multiclassSources, checks },
  };
}
