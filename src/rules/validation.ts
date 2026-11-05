import { asyncMap } from '../db/async-array.js';
import type { Database } from '../db/database.js';
import type { ContentItem, Feat, FeatRequirement, Spell } from '@freshmag/one-dndb';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { ChoiceService } from '../choices/service.js';
import { CapabilityService } from './capabilities.js';
import { BenefitAudit } from './benefits.js';
import { EffectEngine } from './effects.js';
import { attributeState, abilityName } from './attributes.js';
import { AppError } from '../errors.js';
import { multiclassRequirements, multiclassSources } from './multiclass.js';
type State = 'pass' | 'fail' | 'unknown';
export interface Finding {
  code: string;
  state: State;
  message: string;
  entityId?: number;
  evidence?: unknown;
}
interface ClassRow {
  id: number;
  level: number;
  data: string;
  slug: string;
  subclass_id: number | null;
}
interface FeatRow {
  id: number;
  slug: string;
  data: string;
  grant_id: number;
}
interface SpellRow {
  id: number;
  lib_spell_id: number;
  choice_instance_id: number | null;
  origin_kind: string;
  origin_character_class_id: number | null;
  preparation_mode: string;
  is_prepared: number;
  data: string;
}
export function allStates(states: State[]): State {
  return states.includes('fail') ? 'fail' : states.includes('unknown') ? 'unknown' : 'pass';
}
export function anyStates(states: State[]): State {
  return states.includes('pass') ? 'pass' : states.includes('unknown') ? 'unknown' : 'fail';
}
export class ValidationService {
  constructor(private db: Database) {}
  async report(id: number, user?: User) {
    return await this.db.transaction(async () => await this.inspect(id, user)).deferred();
  }
  private async inspect(id: number, user?: User) {
    await new CharacterService(this.db).requireReadable(id, user);
    const profile = (await this.db
      .prepare('SELECT * FROM dnd_character WHERE character_id=?')
      .get(id)) as Record<string, unknown> | undefined;
    if (!profile)
      throw new AppError(409, 'VALIDATION_UNAVAILABLE', 'Validação disponível apenas para D&D');
    const findings: Finding[] = [];
    const classes = (await this.db
      .prepare(
        'SELECT cc.id,cc.level,cc.subclass_id,c.data,e.slug FROM character_class cc JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id WHERE cc.character_id=? ORDER BY cc.id'
      )
      .all(id)) as ClassRow[];
    const total = classes.reduce((sum, c) => sum + c.level, 0);
    const feats = (await this.db
      .prepare(
        'SELECT a.id,a.grant_id,e.slug,f.data FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id JOIN catalog_entry e ON e.id=f.catalog_entry_id WHERE a.character_id=? ORDER BY a.id'
      )
      .all(id)) as FeatRow[];
    const owned = feats.map((row) => ({ ...row, record: JSON.parse(row.data) as Feat }));
    const features = new Set<string>();
    for (const c of classes) {
      const data = JSON.parse(c.data) as ContentItem;
      for (const feature of data.features ?? [])
        if (feature.level <= c.level) features.add(feature.name);
      if (c.subclass_id) {
        const sub = (await this.db
          .prepare('SELECT data FROM lib_subclass WHERE id=?')
          .get(c.subclass_id)) as {
          data: string;
        };
        for (const feature of (JSON.parse(sub.data) as ContentItem).features ?? [])
          if (feature.level <= c.level) features.add(feature.name);
      }
    }
    // Least fixed point: a feat cannot qualify itself with its own bonus,
    // or bootstrap another unproven feat in a dependency cycle.
    const eligible = new Set<number>();
    const descendants = async (root: number) => {
      const excluded = new Set([root]);
      const links = (await this.db
        .prepare(
          'SELECT a.id,g.origin_character_ability_id AS parent FROM character_ability a JOIN character_rule_grant g ON g.id=a.grant_id WHERE a.character_id=? AND a.lib_feat_id IS NOT NULL'
        )
        .all(id)) as {
        id: number;
        parent: number | null;
      }[];
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of links)
          if (row.parent !== null && excluded.has(row.parent) && !excluded.has(row.id)) {
            excluded.add(row.id);
            changed = true;
          }
      }
      return excluded;
    };
    const evaluate = async (
      requirement: FeatRequirement,
      current: FeatRow,
      potential = false
    ): Promise<State> => {
      const excluded = await descendants(current.id);
      const permitted = new Set(
        (potential ? owned.map((f) => f.id) : [...eligible]).filter((key) => !excluded.has(key))
      );
      switch (requirement.kind) {
        case 'level':
          return total >= requirement.level ? 'pass' : 'fail';
        case 'ability': {
          const values = (await attributeState(this.db, id, permitted)).effective;
          const value = values[abilityName(requirement.ability) as keyof typeof values];
          return typeof value === 'number'
            ? value >= requirement.score
              ? 'pass'
              : 'fail'
            : 'unknown';
        }
        case 'feat':
        case 'anyFeat': {
          const matching = owned.filter(
            (f) =>
              !excluded.has(f.id) &&
              (requirement.kind === 'feat'
                ? f.slug === requirement.feat
                : f.record.category === requirement.category)
          );
          return matching.some((f) => eligible.has(f.id))
            ? 'pass'
            : matching.length
              ? 'unknown'
              : 'fail';
        }
        case 'only':
          return owned.some(
            (f) => f.id !== current.id && f.record.category === requirement.category
          )
            ? 'fail'
            : 'pass';
        case 'feature':
          return features.has(requirement.feature) ? 'pass' : 'unknown';
        case 'campaign':
          return typeof profile.campaign_setting === 'string'
            ? profile.campaign_setting.toLowerCase() === requirement.setting.toLowerCase()
              ? 'pass'
              : 'fail'
            : 'unknown';
        default:
          return 'unknown';
      }
    };
    const evaluateFeat = async (feat: (typeof owned)[number], final = false): Promise<State> =>
      feat.record.prereq?.all
        ? allStates(
            await asyncMap(feat.record.prereq.all, async (clause) =>
              anyStates(
                await asyncMap(clause, async (requirement) => {
                  const state = await evaluate(requirement, feat);
                  return final &&
                    state === 'fail' &&
                    requirement.kind === 'ability' &&
                    (await evaluate(requirement, feat, true)) === 'pass'
                    ? 'unknown'
                    : state;
                })
              )
            )
          )
        : feat.record.prereq
          ? 'unknown'
          : 'pass';
    for (let changed = true; changed;) {
      changed = false;
      for (const feat of owned)
        if (!eligible.has(feat.id) && (await evaluateFeat(feat)) === 'pass') {
          eligible.add(feat.id);
          changed = true;
        }
    }
    for (const feat of owned) {
      findings.push({
        code: 'FEAT_PREREQUISITES',
        state: await evaluateFeat(feat, true),
        entityId: feat.id,
        message: 'Pré-requisitos do talento no estado atual da ficha',
        evidence: { slug: feat.slug, prerequisite: feat.record.prereq ?? null },
      });
      if (owned.filter((f) => f.slug === feat.slug).length > 1)
        findings.push({
          code: 'FEAT_REPEATABILITY',
          state: feat.record.repeatable === true ? 'pass' : 'fail',
          entityId: feat.id,
          message: 'Repetição do mesmo talento',
          evidence: { slug: feat.slug, repeatable: feat.record.repeatable ?? false },
        });
    }
    const spells = (await this.db
      .prepare(
        'SELECT s.id,s.lib_spell_id,s.choice_instance_id,s.origin_kind,s.origin_character_class_id,s.preparation_mode,s.is_prepared,l.data FROM character_spell s JOIN lib_spell l ON l.id=s.lib_spell_id WHERE s.character_id=? ORDER BY s.id'
      )
      .all(id)) as SpellRow[];
    for (const cls of classes) {
      const data = JSON.parse(cls.data) as ContentItem;
      const casting = data.casting;
      const direct = spells.filter(
        (s) =>
          s.origin_kind === 'class' &&
          s.origin_character_class_id === cls.id &&
          s.choice_instance_id === null
      );
      for (const instance of direct) {
        const spell = JSON.parse(instance.data) as Spell;
        const limit = casting?.maxSpellLevel?.[cls.level - 1];
        findings.push({
          code: 'CLASS_SPELL_LIST',
          state:
            casting?.list && Array.isArray(spell.classes)
              ? spell.classes.includes(casting.list)
                ? 'pass'
                : 'fail'
              : 'unknown',
          entityId: instance.id,
          message: 'Magia na lista padrão da classe; exceções ainda precisam ser revisadas',
          evidence: { spell: spell.id, class: cls.slug, list: casting?.list ?? null },
        });
        findings.push({
          code: 'CLASS_SPELL_LEVEL',
          state: typeof limit === 'number' ? (spell.level <= limit ? 'pass' : 'fail') : 'unknown',
          entityId: instance.id,
          message: 'Nível da magia versus nível individual da classe',
          evidence: { spellLevel: spell.level, classLevel: cls.level, maximum: limit ?? null },
        });
        if (
          cls.slug === 'wizard' &&
          instance.preparation_mode === 'selectable' &&
          instance.is_prepared
        ) {
          const present = !!(await this.db
            .prepare(
              'SELECT 1 FROM character_spellbook_entry WHERE character_id=? AND character_class_id=? AND lib_spell_id=?'
            )
            .get(id, cls.id, instance.lib_spell_id));
          findings.push({
            code: 'WIZARD_PREPARED_IN_BOOK',
            state: present ? 'pass' : 'fail',
            entityId: instance.id,
            message: 'Magia preparada de mago registrada no grimório',
          });
        }
      }
      const selected = direct.filter(
        (s) => s.preparation_mode === 'selectable' && s.is_prepared
      ).length;
      const cantrips = direct.filter((s) => s.preparation_mode === 'cantrip').length;
      if (direct.length || casting) {
        const prepared = casting?.prepared?.[cls.level - 1],
          maxCantrips = casting?.cantrips?.[cls.level - 1];
        findings.push({
          code: 'CLASS_PREPARED_LIMIT',
          state:
            typeof prepared === 'number' ? (selected <= prepared ? 'pass' : 'fail') : 'unknown',
          entityId: cls.id,
          message: 'Limite padrão de preparação manual por classe, sem contar sempre preparadas',
          evidence: { selected, maximum: prepared ?? null, classLevel: cls.level },
        });
        findings.push({
          code: 'CLASS_CANTRIP_LIMIT',
          state:
            typeof maxCantrips === 'number'
              ? cantrips <= maxCantrips
                ? 'pass'
                : 'fail'
              : 'unknown',
          entityId: cls.id,
          message: 'Limite padrão de truques de origem classe',
          evidence: { selected: cantrips, maximum: maxCantrips ?? null, classLevel: cls.level },
        });
      }
      const entries = (await this.db
        .prepare(
          'SELECT b.id,l.data FROM character_spellbook_entry b JOIN lib_spell l ON l.id=b.lib_spell_id WHERE b.character_id=? AND b.character_class_id=?'
        )
        .all(id, cls.id)) as {
        id: number;
        data: string;
      }[];
      for (const entry of entries) {
        const spell = JSON.parse(entry.data) as Spell;
        const limit = casting?.maxSpellLevel?.[cls.level - 1];
        findings.push({
          code: 'SPELLBOOK_ENTRY',
          state:
            cls.slug !== 'wizard' || spell.level === 0
              ? 'fail'
              : typeof limit === 'number' && Array.isArray(spell.classes)
                ? spell.classes.includes('wizard') && spell.level <= limit
                  ? 'pass'
                  : 'fail'
                : 'unknown',
          entityId: entry.id,
          message: 'Lista e nível padrão da entrada do grimório',
          evidence: { spell: spell.id, classLevel: cls.level, maximum: limit ?? null },
        });
      }
    }
    findings.push(
      multiclassRequirements(classes, (await attributeState(this.db, id, eligible)).effective)
    );
    findings.push(...(await new CapabilityService(this.db).audit(id)));
    findings.push(...(await new BenefitAudit(this.db).inspect(id)).findings);
    findings.push(...(await new ChoiceService(this.db).inspect(id)).findings);
    findings.push(...(await new EffectEngine(this.db).audit(id)));
    findings.push({
      code: 'TEXT_RULES_REVIEW',
      state: 'unknown',
      message:
        'Condições de mesa e efeitos descritos apenas em texto exigem revisão; o relatório não certifica o histórico de aquisição.',
    });
    return {
      characterId: id,
      basis: {
        libraryVersion: '0.5.1',
        catalogRevision: await this.db
          .prepare('SELECT revision,library_version FROM ruleset_revision ORDER BY id DESC LIMIT 1')
          .get(),
        characterSavedRevisionId: profile.ruleset_revision_id,
        mode: 'catalog-audit',
        scope: 'current-state',
        officialSources: multiclassSources,
      },
      coverage: (await new EffectEngine(this.db).report(id)).coverage,
      rulesVerified: false,
      summary: {
        passed: findings.filter((f) => f.state === 'pass').length,
        failed: findings.filter((f) => f.state === 'fail').length,
        unknown: findings.filter((f) => f.state === 'unknown').length,
      },
      findings,
    };
  }
}
