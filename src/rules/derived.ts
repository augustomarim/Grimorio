import { asyncMap, asyncFlatMap } from '../db/async-array.js';
import type { Database } from '../db/database.js';
import type { Item } from '@freshmag/one-dndb';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { abilities, attributeState, type Ability } from './attributes.js';
import { EffectEngine } from './effects.js';
export const modifier = (score: number) => Math.floor((score - 10) / 2);
export function proficiencyBonus(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 20)
    throw new RangeError('Nível total inválido');
  return 2 + Math.floor((level - 1) / 4);
}
// Accept only the actual mundane AC grammar; never evaluate external strings as code.
export function armorFormula(formula: string | undefined, dexterity: number): number | null {
  if (!formula) return null;
  const match = /^(\d+)(?: \+ Dex modifier(?: \(max (\d+)\))?)?$/.exec(formula);
  if (!match) return null;
  return (
    Number(match[1]) +
    (formula.includes('Dex') ? Math.min(dexterity, match[2] ? Number(match[2]) : Infinity) : 0)
  );
}
interface Equipped {
  id: number;
  quantity: number;
  data: string;
  name: string;
  slug: string;
}
export class DerivedService {
  constructor(private db: Database) {}
  async report(id: number, user?: User) {
    return await this.db
      .transaction(async () => {
        await new CharacterService(this.db).requireReadable(id, user);
        const attributes = await attributeState(this.db, id);
        const scores = attributes.effective;
        const modifiers = Object.fromEntries(
          abilities.map((a) => [a, modifier(scores[a])])
        ) as Record<Ability, number>;
        const engine = new EffectEngine(this.db),
          sources = await engine.sources(id),
          projected = await engine.project(id);
        const total = (
          (await this.db
            .prepare('SELECT SUM(level) n FROM character_class WHERE character_id=?')
            .get(id)) as {
            n: number;
          }
        ).n;
        const pb = proficiencyBonus(total);
        const bard = sources.find((s) => s.kind === 'class' && s.slug === 'bard' && s.level >= 2);
        const jack = !!bard?.data.features?.some(
          (f) => f.name.toLowerCase() === 'jack of all trades' && f.level <= bard.level
        );
        const skills = await asyncMap(
          (await this.db
            .prepare(
              'SELECT l.id,l.ability,e.name,e.slug FROM lib_skill l JOIN catalog_entry e ON e.id=l.catalog_entry_id ORDER BY e.name'
            )
            .all()) as {
            id: number;
            ability: Ability;
            name: string;
            slug: string;
          }[],
          async (s) => {
            const rank = projected.skills.find((p) => p.name === s.name)?.rank ?? 0;
            const contribution = rank ? rank * pb : jack ? Math.floor(pb / 2) : 0;
            return {
              ...s,
              proficiencyRank: rank,
              abilityModifier: modifiers[s.ability],
              proficiencyContribution: contribution,
              bonus: modifiers[s.ability] + contribution,
              jackOfAllTrades: rank === 0 && jack,
            };
          }
        );
        const savingThrows = abilities.map((ability) => ({
          ability,
          proficient: projected.savingThrows.includes(ability),
          bonus: modifiers[ability] + (projected.savingThrows.includes(ability) ? pb : 0),
        }));
        const equipment = (await this.db
          .prepare(
            'SELECT ci.id,ci.quantity,l.data,e.name,e.slug FROM character_item ci JOIN lib_item l ON l.id=ci.lib_item_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE ci.character_id=? AND ci.equipped=1 ORDER BY ci.id'
          )
          .all(id)) as Equipped[];
        const textReview = await asyncFlatMap(sources, async (source) => {
          const fragments =
            source.data.features
              ?.filter((f) => f.level <= source.level)
              .map((f) => ({ name: f.name, text: f.body })) ?? [];
          if (source.kind === 'feat') {
            const raw = (await this.db
              .prepare(
                'SELECT f.data FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id WHERE a.id=? AND a.character_id=?'
              )
              .get(source.instanceId, id)) as {
              data: string;
            };
            fragments.push({ name: source.name, text: JSON.parse(raw.data).text ?? '' });
          }
          return fragments
            .filter((f) => f.name !== 'Unarmored Defense')
            .flatMap((f) => {
              const areas = [];
              if (/armor class|\bAC\b/i.test(f.text)) areas.push('armorClass');
              if (
                /initiative/i.test(f.text) &&
                !(source.slug === 'alert' && source.kind === 'feat')
              )
                areas.push('initiative');
              if (/hit point/i.test(f.text)) areas.push('hitPoints');
              return areas.length ? [{ source: source.identity, name: f.name, areas }] : [];
            });
        });
        const armor = await this.armor(
          equipment,
          modifiers,
          projected.armor,
          sources,
          scores.strength
        );
        if (textReview.some((r) => r.areas.includes('armorClass'))) {
          armor.issues.push('TEXT_ARMOR_EFFECTS_REQUIRES_REVIEW');
          armor.value = null;
        }
        const alert = sources.some((s) => s.kind === 'feat' && s.slug === 'alert');
        const count = (
          (await this.db
            .prepare('SELECT count(*) n FROM character_level_entry WHERE character_id=?')
            .get(id)) as {
            n: number;
          }
        ).n;
        const hp = (await this.db
          .prepare(
            'SELECT base_hit_points,modeled_max_hit_points FROM character_hit_point_summary WHERE character_id=?'
          )
          .get(id)) as {
          base_hit_points: number;
          modeled_max_hit_points: number;
        };
        return {
          characterId: id,
          totalLevel: total,
          attributes: { ...attributes, modifiers },
          proficiencyBonus: pb,
          skills,
          savingThrows,
          initiative: {
            base: modifiers.dexterity,
            alertContribution: alert ? pb : 0,
            modeledBonus: modifiers.dexterity + (alert ? pb : 0),
            scope: 'sem condições temporárias; troca de iniciativa não executada',
          },
          passivePerception: {
            base: 10,
            modeledValue:
              10 + (skills.find((s) => s.name === 'Perception')?.bonus ?? modifiers.wisdom),
            scope: 'sem vantagem/desvantagem situacional',
          },
          armorClass: armor,
          hitPoints: {
            historyComplete: count === total,
            recordedLevels: count,
            totalLevels: total,
            base: count === total ? hp.base_hit_points : null,
            modeledMaximum: count === total ? hp.modeled_max_hit_points : null,
            scope: 'Constituição efetiva e bônus de PV registrados; não representa PV atuais',
          },
          basis: {
            rules:
              'SRD 5.2: proficiência, perícias, resistências, iniciativa, armadura e defesa sem armadura',
            libraryVersion: '0.5.1',
            scope: 'persisted-current-state',
            temporaryEffects: false,
          },
          textEffectsRequiringReview: textReview,
          rulesVerified: false,
          limitations: [
            'Valores modelados usam as escolhas registradas, inclusive rascunhos; consulte /validation.',
            'Efeitos adicionais descritos apenas em texto não são automaticamente somados.',
            'Saving throws são testes de resistência; resistências a tipos de dano não são inferidas.',
          ],
        };
      })
      .deferred();
  }
  private async armor(
    equipment: Equipped[],
    m: Record<Ability, number>,
    training: string[],
    sources: Awaited<ReturnType<EffectEngine['sources']>>,
    strengthScore: number
  ) {
    const worn = equipment.map((row) => ({ ...row, item: JSON.parse(row.data) as Item }));
    const armor = worn.filter((r) => r.item.kind === 'armor' && r.item.shelf !== 'Shield');
    const shields = worn.filter((r) => r.item.kind === 'armor' && r.item.shelf === 'Shield');
    const issues: string[] = [];
    if (armor.length > 1 || shields.length > 1) issues.push('MULTIPLE_ARMOR_OR_SHIELDS');
    if ([...armor, ...shields].some((r) => r.quantity !== 1))
      issues.push('EQUIPPED_ARMOR_QUANTITY');
    if (worn.some((r) => r.item.magic)) issues.push('MAGIC_EQUIPMENT_REQUIRES_REVIEW');
    const candidates: {
      source: string;
      value: number;
    }[] = [];
    if (!armor.length) {
      candidates.push({ source: 'unarmored', value: 10 + m.dexterity });
      for (const s of sources.filter(
        (s) => s.kind === 'class' && ['monk', 'barbarian'].includes(s.slug)
      )) {
        if (!s.data.features?.some((f) => f.name === 'Unarmored Defense' && f.level <= s.level))
          continue;
        if (s.slug === 'monk' && shields.length) continue;
        candidates.push({
          source: `${s.slug}:unarmored-defense`,
          value: 10 + m.dexterity + (s.slug === 'monk' ? m.wisdom : m.constitution),
        });
      }
    } else if (armor.length === 1) {
      const row = armor[0]!,
        value = armorFormula(row.item.ac, m.dexterity);
      if (value === null) issues.push('UNKNOWN_ARMOR_FORMULA');
      else candidates.push({ source: row.slug, value });
    }
    const penalties: string[] = [];
    for (const row of armor) {
      const category = (
        { 'Light Armor': 'Light', 'Medium Armor': 'Medium', 'Heavy Armor': 'Heavy' } as Record<
          string,
          string
        >
      )[row.item.shelf ?? ''];
      if (!category) issues.push('UNKNOWN_ARMOR_CATEGORY');
      else if (!training.includes(category))
        penalties.push('ARMOR_UNTRAINED_STR_DEX_DISADVANTAGE_AND_NO_SPELLCASTING');
      const strength = /^Str (\d+)$/.exec(row.item.strength ?? '');
      if (strength && strengthScore < Number(strength[1])) {
        penalties.push(`STRENGTH_REQUIREMENT_${strength[1]}`);
      }
      if (row.item.stealth === 'Disadvantage') penalties.push('STEALTH_DISADVANTAGE');
    }
    let shieldBonus = 0;
    if (shields.length === 1) {
      if (training.includes('Shield') && shields[0]!.item.ac === '+2') shieldBonus = 2;
      else if (!training.includes('Shield')) penalties.push('SHIELD_UNTRAINED_NO_AC_BONUS');
      else issues.push('UNKNOWN_SHIELD_FORMULA');
    }
    const best = candidates.length
      ? Math.max(...candidates.map((c) => c.value)) + shieldBonus
      : null;
    return {
      value: issues.length ? null : best,
      modeledValue: best,
      candidates,
      shieldBonus,
      issues,
      penalties: [...new Set(penalties)],
      scope: 'fórmula básica ou defesa sem armadura; efeitos textuais adicionais exigem revisão',
    };
  }
}
