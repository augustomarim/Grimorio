import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CharacterInput } from './service.js';
import { AppError } from '../errors.js';
const tables = [
  'character',
  'dnd_character',
  'character_class',
  'character_narrative',
  'character_item',
  'character_ability',
  'character_spell',
  'character_spellbook_entry',
  'character_fighting_style',
  'character_rule_grant',
  'character_skill',
  'character_saving_throw',
  'character_armor_training',
  'character_weapon_training',
  'character_weapon_mastery',
  'character_level_entry',
  'character_hit_point_bonus',
  'character_choice',
] as const;
type Row = Record<string, unknown>;
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
    .join(',')}}`;
}
interface Plan {
  confirmationToken: string;
  requiresConfirmation: boolean;
  removals: { table: string; ids: number[]; count: number }[];
  progressionReplacement: { before: number; after: number } | null;
  policy: string;
}
class PreviewRollback extends Error {
  constructor(public plan: Plan) {
    super('Rollback da prévia');
  }
}
export class Reconciliation {
  constructor(
    private db: Database.Database,
    private context?: { scope: string; root: { table: string; id: number }; previewPath?: string }
  ) {}
  private snapshot(id: number) {
    const result: Record<string, Row[]> = {};
    for (const table of tables) {
      const pk = table === 'character' ? 'id' : 'character_id';
      result[table] = this.db
        .prepare(`SELECT * FROM ${table} WHERE ${pk}=? ORDER BY rowid`)
        .all(id) as Row[];
    }
    result.character_weapon_training_property = this.db
      .prepare(
        'SELECT p.rowid AS id,p.* FROM character_weapon_training_property p JOIN character_weapon_training t ON t.id=p.training_id WHERE t.character_id=? ORDER BY p.training_id,p.property_id,p.predicate'
      )
      .all(id) as Row[];
    result.ruleset_revision = this.db
      .prepare('SELECT id,revision,library_version,loaded_at FROM ruleset_revision ORDER BY id')
      .all() as Row[];
    return result;
  }
  private cleanup(id: number, input: CharacterInput) {
    const profile = this.db
      .prepare('SELECT species_id,background_id FROM dnd_character WHERE character_id=?')
      .get(id) as { species_id: number; background_id: number | null } | undefined;
    if (!profile) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Perfil D&D incompleto');
    for (const [key, column] of [
      ['speciesId', 'origin_species_id'],
      ['backgroundId', 'origin_background_id'],
    ] as const) {
      const current = key === 'speciesId' ? profile.species_id : profile.background_id;
      if (input[key] !== undefined && input[key] !== current) {
        this.db
          .prepare(`DELETE FROM character_spell WHERE character_id=? AND ${column} IS NOT NULL`)
          .run(id);
        this.db
          .prepare(
            `DELETE FROM character_rule_grant WHERE character_id=? AND ${column} IS NOT NULL`
          )
          .run(id);
      }
    }
    if (!input.classes) return;
    const old = this.db
      .prepare(
        'SELECT id,class_id,level,subclass_id,is_initial_class FROM character_class WHERE character_id=?'
      )
      .all(id) as {
      id: number;
      class_id: number;
      level: number;
      subclass_id: number | null;
      is_initial_class: number;
    }[];
    for (const row of old) {
      const next = input.classes.find((c) => c.classId === row.class_id);
      if (!next) continue; // The existing class removal applies all FK cascades.
      if (next.level < row.level) {
        // No full historical rule-level mapping exists. Explicitly show this conservative reset.
        this.db
          .prepare(
            'DELETE FROM character_spell WHERE character_id=? AND origin_character_class_id=?'
          )
          .run(id, row.id);
        this.db
          .prepare(
            'DELETE FROM character_rule_grant WHERE character_id=? AND origin_character_class_id=?'
          )
          .run(id, row.id);
        this.db
          .prepare(
            'DELETE FROM character_spellbook_entry WHERE character_id=? AND character_class_id=?'
          )
          .run(id, row.id);
      } else if ((next.subclassId ?? null) !== row.subclass_id) {
        this.db
          .prepare(
            "DELETE FROM character_spell WHERE character_id=? AND origin_character_class_id=? AND origin_kind='subclass'"
          )
          .run(id, row.id);
        this.db
          .prepare(
            "DELETE FROM character_rule_grant WHERE character_id=? AND origin_character_class_id=? AND origin_kind='subclass'"
          )
          .run(id, row.id);
      }
      if (Number(next.initial) !== row.is_initial_class)
        this.db
          .prepare(
            "DELETE FROM character_rule_grant WHERE character_id=? AND origin_character_class_id=? AND acquisition_context IN ('initial_class','multiclass_entry')"
          )
          .run(id, row.id);
    }
    const total = input.classes.reduce((sum, c) => sum + c.level, 0);
    this.db
      .prepare('DELETE FROM character_rule_grant WHERE character_id=? AND acquired_at_level>?')
      .run(id, total);
  }
  private evaluate(id: number, input: CharacterInput, operation: () => void): Plan {
    try {
      this.db.transaction(() => {
        const before = this.snapshot(id);
        this.cleanup(id, input);
        operation();
        const after = this.snapshot(id),
          removals: Plan['removals'] = [];
        for (const table of [...tables, 'character_weapon_training_property']) {
          if (
            ['character', 'dnd_character', 'character_class', 'character_level_entry'].includes(
              table
            )
          )
            continue;
          const remaining = new Set(after[table]!.map((row) => row.id ?? row.character_id));
          const ids = before[table]!.filter(
            (row) => !remaining.has(row.id ?? row.character_id)
          ).map((row) => Number(row.id ?? row.character_id));
          if (ids.length) removals.push({ table, ids, count: ids.length });
        }
        const plan: Plan = {
          confirmationToken: createHash('sha256')
            .update(stable({ scope: this.context?.scope ?? 'character.update', id, input, before }))
            .digest('hex'),
          requiresConfirmation: removals.some((r) =>
            r.ids.some(
              (id) => !(r.table === this.context?.root.table && id === this.context.root.id)
            )
          ),
          removals,
          progressionReplacement: input.classes
            ? {
                before: before.character_level_entry!.length,
                after: after.character_level_entry!.length,
              }
            : null,
          policy:
            'Troca remove somente dependências vinculadas às origens afetadas. Redução de nível reinicia concessões, magias e grimório da classe reduzida; exige revisão das escolhas.',
        };
        throw new PreviewRollback(plan);
      })();
    } catch (error) {
      if (error instanceof PreviewRollback) return error.plan;
      throw error;
    }
    throw new Error('A prévia deveria ter sido revertida');
  }
  preview(id: number, input: CharacterInput, operation: () => void) {
    return this.db.transaction(() => this.evaluate(id, input, operation)).immediate();
  }
  apply(
    id: number,
    actorId: number,
    input: CharacterInput,
    operation: () => void,
    confirmationToken?: string
  ) {
    return this.db
      .transaction(() => {
        const plan = this.evaluate(id, input, operation);
        if (confirmationToken !== undefined && confirmationToken !== plan.confirmationToken)
          throw new AppError(
            409,
            'CHANGE_PREVIEW_STALE',
            'A ficha ou a alteração mudou; gere uma nova prévia'
          );
        if (plan.requiresConfirmation && !confirmationToken)
          throw new AppError(
            409,
            'DEPENDENCIES_REQUIRE_CONFIRMATION',
            `A alteração remove dependências; consulte POST ${this.context?.previewPath ?? `/characters/${id}/changes/preview`} e confirme o token na operação original`
          );
        this.cleanup(id, input);
        operation();
        if (plan.requiresConfirmation)
          this.db
            .prepare(
              "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,'character.reconcile','character',?,?)"
            )
            .run(actorId, id, JSON.stringify({ removals: plan.removals }));
      })
      .immediate();
  }
}
