import type Database from 'better-sqlite3';
import type { ContentItem, Feat, FeatRequirement, Spell } from '@freshmag/one-dndb';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { AppError } from '../errors.js';

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
  constructor(private db: Database.Database) {}
  report(id: number, user?: User) {
    return this.db.transaction(() => this.inspect(id, user)).deferred();
  }
  private inspect(id: number, user?: User) {
    new CharacterService(this.db).requireReadable(id, user);
    const profile = this.db.prepare('SELECT * FROM dnd_character WHERE character_id=?').get(id) as
      Record<string, unknown> | undefined;
    if (!profile)
      throw new AppError(409, 'VALIDATION_UNAVAILABLE', 'Validação disponível apenas para D&D');
    const findings: Finding[] = [];
    const classes = this.db
      .prepare(
        'SELECT cc.id,cc.level,cc.subclass_id,c.data,e.slug FROM character_class cc JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id WHERE cc.character_id=? ORDER BY cc.id'
      )
      .all(id) as ClassRow[];
    const total = classes.reduce((sum, c) => sum + c.level, 0);
    const feats = this.db
      .prepare(
        'SELECT a.id,a.grant_id,e.slug,f.data FROM character_ability a JOIN lib_feat f ON f.id=a.lib_feat_id JOIN catalog_entry e ON e.id=f.catalog_entry_id WHERE a.character_id=? ORDER BY a.id'
      )
      .all(id) as FeatRow[];
    const owned = feats.map((row) => ({ ...row, record: JSON.parse(row.data) as Feat }));
    const features = new Set<string>();
    for (const c of classes) {
      const data = JSON.parse(c.data) as ContentItem;
      for (const feature of data.features ?? [])
        if (feature.level <= c.level) features.add(feature.name);
      if (c.subclass_id) {
        const sub = this.db
          .prepare('SELECT data FROM lib_subclass WHERE id=?')
          .get(c.subclass_id) as { data: string };
        for (const feature of (JSON.parse(sub.data) as ContentItem).features ?? [])
          if (feature.level <= c.level) features.add(feature.name);
      }
    }
    const evaluate = (requirement: FeatRequirement, current: FeatRow): State => {
      switch (requirement.kind) {
        case 'level':
          return total >= requirement.level ? 'pass' : 'fail';
        case 'ability': {
          const keys: Record<string, string> = {
            str: 'strength',
            dex: 'dexterity',
            con: 'constitution',
            int: 'intelligence',
            wis: 'wisdom',
            cha: 'charisma',
          };
          const name = requirement.ability.toLowerCase();
          const value = profile[keys[name] ?? name];
          return typeof value === 'number'
            ? value >= requirement.score
              ? 'pass'
              : 'fail'
            : 'unknown';
        }
        case 'feat':
          return owned.some((f) => f.id !== current.id && f.slug === requirement.feat)
            ? 'pass'
            : 'fail';
        case 'anyFeat':
          return owned.some(
            (f) => f.id !== current.id && f.record.category === requirement.category
          )
            ? 'pass'
            : 'fail';
        case 'only':
          return owned.some(
            (f) => f.id !== current.id && f.record.category === requirement.category
          )
            ? 'fail'
            : 'pass';
        case 'feature':
          return features.has(requirement.feature) ? 'pass' : 'unknown';
        case 'campaign':
          return 'unknown';
        default:
          return 'unknown';
      }
    };
    for (const feat of owned) {
      const clauses = feat.record.prereq?.all;
      findings.push({
        code: 'FEAT_PREREQUISITES',
        state: clauses
          ? allStates(clauses.map((clause) => anyStates(clause.map((r) => evaluate(r, feat)))))
          : feat.record.prereq
            ? 'unknown'
            : 'pass',
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
    const spells = this.db
      .prepare(
        'SELECT s.id,s.lib_spell_id,s.origin_kind,s.origin_character_class_id,s.preparation_mode,s.is_prepared,l.data FROM character_spell s JOIN lib_spell l ON l.id=s.lib_spell_id WHERE s.character_id=? ORDER BY s.id'
      )
      .all(id) as SpellRow[];
    for (const cls of classes) {
      const data = JSON.parse(cls.data) as ContentItem;
      const casting = data.casting;
      const direct = spells.filter(
        (s) => s.origin_kind === 'class' && s.origin_character_class_id === cls.id
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
          const present = !!this.db
            .prepare(
              'SELECT 1 FROM character_spellbook_entry WHERE character_id=? AND character_class_id=? AND lib_spell_id=?'
            )
            .get(id, cls.id, instance.lib_spell_id);
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
      const entries = this.db
        .prepare(
          'SELECT b.id,l.data FROM character_spellbook_entry b JOIN lib_spell l ON l.id=b.lib_spell_id WHERE b.character_id=? AND b.character_class_id=?'
        )
        .all(id, cls.id) as { id: number; data: string }[];
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
    findings.push({
      code: 'MULTICLASS_REQUIREMENTS',
      state: classes.length > 1 ? 'unknown' : 'pass',
      message:
        classes.length > 1
          ? 'Pré-requisitos de multiclasse não foram confirmados em fonte normativa; primaryAbility não define sozinho combinações E/OU'
          : 'Ficha com uma classe',
    });
    for (const code of [
      'BENEFIT_CHOICES',
      'ACQUISITION_HISTORY',
      'SPELL_EXCEPTIONS',
      'CAMPAIGN_RULES',
    ])
      findings.push({
        code,
        state: 'unknown',
        message: 'Verificação ainda não implementada ou dependente de informação adicional',
      });
    return {
      characterId: id,
      basis: {
        libraryVersion: '0.5.1',
        catalogRevision: this.db
          .prepare('SELECT revision,library_version FROM ruleset_revision ORDER BY id DESC LIMIT 1')
          .get(),
        characterSavedRevisionId: profile.ruleset_revision_id,
        mode: 'catalog-audit',
        scope: 'current-state',
      },
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
