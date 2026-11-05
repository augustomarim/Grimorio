import type Database from 'better-sqlite3';
import type { User } from '../auth/service.js';
import { Reconciliation } from '../characters/reconciliation.js';
import { CharacterService } from '../characters/service.js';
import { EffectEngine } from '../rules/effects.js';
import { ValidationService } from '../rules/validation.js';
import { BenefitAudit, type Grant } from '../rules/benefits.js';
import {
  sourceChoices,
  featSpellEffectsChoice,
  sourceSpellEffectsChoice,
} from '../rules/source-choices.js';
import { AppError } from '../errors.js';
import { sources } from '../catalog/routes.js';

export interface GrantInput {
  originKind: 'class' | 'subclass' | 'species' | 'background' | 'feat';
  originId: number;
  acquisitionContext:
    'initial_class' | 'multiclass_entry' | 'class_progression' | 'species' | 'background' | 'feat';
  ruleKey: string;
  acquiredAtLevel: number;
}
export interface BenefitInput {
  kind: 'feat' | 'tool' | 'language' | 'skill';
  localId: number;
  grantId: number;
  selectionKind: 'fixed' | 'chosen';
  choiceKey?: string;
  proficiencyRank?: number;
  notes?: string | null;
}
export class BenefitService {
  private characters: CharacterService;
  constructor(private db: Database.Database) {
    this.characters = new CharacterService(db);
  }
  private profile(id: number) {
    if (!this.db.prepare('SELECT 1 FROM dnd_character WHERE character_id=?').get(id))
      throw new AppError(409, 'BENEFITS_UNAVAILABLE', 'Benefícios disponíveis apenas para D&D');
  }
  private saved(id: number, user: User, action: string) {
    this.db
      .prepare('UPDATE character SET updated_at=? WHERE id=?')
      .run(new Date().toISOString(), id);
    this.db
      .prepare(
        'UPDATE dnd_character SET ruleset_revision_id=(SELECT id FROM ruleset_revision ORDER BY id DESC LIMIT 1) WHERE character_id=?'
      )
      .run(id);
    this.db
      .prepare(
        "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES(?,?,'character',?)"
      )
      .run(user.id, action, id);
  }
  grant(id: number, user: User, input: GrantInput) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const total = this.db
          .prepare('SELECT SUM(level) AS level FROM character_class WHERE character_id=?')
          .get(id) as { level: number };
        if (input.acquiredAtLevel > total.level)
          throw new AppError(400, 'INVALID_GRANT', 'Aquisição acima do nível total');
        const origin: Array<number | null> = [null, null, null, null, null, null];
        if (input.originKind === 'class' || input.originKind === 'subclass') {
          const row = this.db
            .prepare(
              'SELECT id,subclass_id,is_initial_class FROM character_class WHERE character_id=? AND id=?'
            )
            .get(id, input.originId) as
            { id: number; subclass_id: number | null; is_initial_class: number } | undefined;
          if (
            !row ||
            (input.originKind === 'subclass' && !row.subclass_id) ||
            (input.acquisitionContext === 'initial_class' && !row.is_initial_class) ||
            (input.acquisitionContext === 'multiclass_entry' && row.is_initial_class)
          )
            throw new AppError(400, 'INVALID_GRANT', 'Origem de classe incompatível');
          origin[0] = row.id;
          if (input.originKind === 'subclass') origin[1] = row.subclass_id;
        } else if (input.originKind === 'feat') {
          const row = this.db
            .prepare(
              'SELECT lib_feat_id FROM character_ability WHERE character_id=? AND id=? AND lib_feat_id IS NOT NULL'
            )
            .get(id, input.originId) as { lib_feat_id: number } | undefined;
          if (!row)
            throw new AppError(
              400,
              'INVALID_GRANT',
              'Talento de origem não pertence ao personagem'
            );
          origin[4] = input.originId;
          origin[5] = row.lib_feat_id;
        } else {
          const column = input.originKind === 'species' ? 'species_id' : 'background_id';
          if (
            !this.db
              .prepare(`SELECT 1 FROM dnd_character WHERE character_id=? AND ${column}=?`)
              .get(id, input.originId)
          )
            throw new AppError(400, 'INVALID_GRANT', 'Origem não pertence ao personagem');
          origin[input.originKind === 'species' ? 2 : 3] = input.originId;
        }
        const result = this.db
          .prepare(
            'INSERT INTO character_rule_grant(character_id,origin_kind,origin_character_class_id,origin_subclass_id,origin_species_id,origin_background_id,origin_character_ability_id,origin_feat_id,acquisition_context,rule_key,acquired_at_level) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
          )
          .run(
            id,
            input.originKind,
            ...origin,
            input.acquisitionContext,
            input.ruleKey,
            input.acquiredAtLevel
          );
        const grantId = Number(result.lastInsertRowid);
        let spellChoiceInstanceId: number | undefined;
        {
          const grant = this.db
            .prepare('SELECT * FROM character_rule_grant WHERE character_id=? AND id=?')
            .get(id, grantId) as Grant;
          const source = new BenefitAudit(this.db).source(id, grant);
          const group =
            source &&
            sourceChoices(source).find((choice) =>
              [featSpellEffectsChoice, sourceSpellEffectsChoice].includes(choice.id)
            );
          if (source && group) {
            const existing = (
              this.db
                .prepare(
                  'SELECT c.id,c.grant_id FROM character_choice c WHERE c.character_id=? AND c.choice_id=?'
                )
                .all(id, group.id) as { id: number; grant_id: number }[]
            ).find((c) => {
              const g = this.db
                .prepare('SELECT * FROM character_rule_grant WHERE id=? AND character_id=?')
                .get(c.grant_id, id) as Grant;
              return new BenefitAudit(this.db).source(id, g)?.identity === source.identity;
            });
            spellChoiceInstanceId =
              existing?.id ??
              Number(
                this.db
                  .prepare(
                    'INSERT INTO character_choice(character_id,grant_id,choice_id,option_id) VALUES(?,?,?,?)'
                  )
                  .run(id, grantId, group.id, 'catalog').lastInsertRowid
              );
          }
        }
        this.saved(id, user, 'benefit.grant');
        return {
          id: grantId,
          ...(spellChoiceInstanceId === undefined ? {} : { spellChoiceInstanceId }),
        };
      })
      .immediate();
  }
  add(id: number, user: User, input: BenefitInput, strict = false) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        if (
          !this.db
            .prepare('SELECT 1 FROM character_rule_grant WHERE character_id=? AND id=?')
            .get(id, input.grantId)
        )
          throw new AppError(400, 'INVALID_GRANT', 'Concessão não pertence ao personagem');
        const catalog = this.db
          .prepare(
            `SELECT e.id,e.deprecated_at FROM lib_${input.kind} l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE l.id=?`
          )
          .get(input.localId) as { id: number; deprecated_at: string | null } | undefined;
        if (!catalog || catalog.deprecated_at)
          throw new AppError(400, 'INVALID_BENEFIT', 'Registro inexistente ou depreciado');
        if (
          (input.selectionKind === 'chosen') !== !!input.choiceKey?.trim() ||
          (input.selectionKind === 'fixed' && input.choiceKey !== undefined)
        )
          throw new AppError(
            400,
            'INVALID_SELECTION',
            'Escolha exige choiceKey; benefício fixo não aceita choiceKey'
          );
        const ranked = input.kind === 'tool' || input.kind === 'skill';
        if (
          ranked
            ? ![1, 2].includes(input.proficiencyRank ?? 0)
            : input.proficiencyRank !== undefined
        )
          throw new AppError(
            400,
            'INVALID_RANK',
            'Graduação 1 ou 2 apenas para ferramentas e perícias'
          );
        const inspector = new BenefitAudit(this.db),
          effects = new EffectEngine(this.db);
        const signature = (f: unknown) => JSON.stringify(f);
        const beforeFailures = strict
          ? new Set(
              [...inspector.inspect(id).findings, ...effects.audit(id)]
                .filter((f) => f.state === 'fail')
                .map(signature)
            )
          : new Set<string>();
        if (strict) {
          const grant = this.db
            .prepare('SELECT * FROM character_rule_grant WHERE character_id=? AND id=?')
            .get(id, input.grantId) as Grant;
          const source = inspector.source(id, grant)!;
          if (
            input.selectionKind === 'chosen' &&
            !inspector
              .inspect(id)
              .options.some((o) => o.grantId === input.grantId && o.choiceKey === input.choiceKey)
          )
            throw new AppError(
              409,
              'RULE_UNIDENTIFIED',
              'Use uma chave de escolha retornada pelo catálogo de efeitos'
            );
          if (
            input.selectionKind === 'fixed' &&
            input.kind === 'tool' &&
            input.proficiencyRank !== 1
          )
            throw new AppError(
              400,
              'EFFECT_NOT_GRANTED',
              'Ferramenta fixa concede proficiência simples'
            );
          if (input.selectionKind === 'fixed') {
            const row = this.db
              .prepare(
                `SELECT e.slug,e.name FROM lib_${input.kind} l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE l.id=?`
              )
              .get(input.localId) as { slug: string; name: string };
            const fixed =
              input.kind === 'feat'
                ? source.data.featsFixed
                    ?.filter((r) => source.level >= (r.level ?? 1))
                    .map((r) => r.id)
                : input.kind === 'skill'
                  ? input.proficiencyRank === 2
                    ? source.data.expertiseFixed
                    : source.data.skillsFixed
                  : input.kind === 'tool'
                    ? source.data.toolsFixed
                    : source.data.languagesFixed;
            if (!fixed?.includes(input.kind === 'skill' ? row.name : row.slug))
              throw new AppError(
                400,
                'EFFECT_NOT_GRANTED',
                'Benefício fixo não concedido pela origem'
              );
          }
          if (input.kind === 'feat') {
            const feat = this.db
              .prepare('SELECT data FROM lib_feat WHERE id=?')
              .get(input.localId) as { data: string };
            if (
              JSON.parse(feat.data).repeatable !== true &&
              this.db
                .prepare('SELECT 1 FROM character_ability WHERE character_id=? AND lib_feat_id=?')
                .get(id, input.localId)
            )
              throw new AppError(400, 'FEAT_NOT_REPEATABLE', 'Talento não repetível já registrado');
          }
        }
        let result;
        if (input.kind === 'skill')
          result = this.db
            .prepare(
              'INSERT INTO character_skill(character_id,grant_id,selection_kind,choice_key,notes,skill_id,proficiency_rank) VALUES(?,?,?,?,?,?,?)'
            )
            .run(
              id,
              input.grantId,
              input.selectionKind,
              input.choiceKey ?? null,
              input.notes ?? null,
              input.localId,
              input.proficiencyRank!
            );
        else
          result = this.db
            .prepare(
              `INSERT INTO character_ability(character_id,grant_id,selection_kind,choice_key,notes,lib_${input.kind}_id,proficiency_rank) VALUES(?,?,?,?,?,?,?)`
            )
            .run(
              id,
              input.grantId,
              input.selectionKind,
              input.choiceKey ?? null,
              input.notes ?? null,
              input.localId,
              input.proficiencyRank ?? null
            );
        if (strict) {
          const errors = [...inspector.inspect(id).findings, ...effects.audit(id)].filter(
            (f) => f.state === 'fail' && !beforeFailures.has(signature(f))
          );
          const ambiguous = inspector
            .inspect(id)
            .findings.find(
              (f) =>
                f.state === 'unknown' &&
                f.entityId === Number(result.lastInsertRowid) &&
                (f.evidence as { kind?: string } | undefined)?.kind === input.kind
            );
          if (ambiguous) throw new AppError(409, 'RULE_UNIDENTIFIED', ambiguous.message);
          if (errors.length) throw new AppError(400, 'EFFECT_RULE_VIOLATION', errors[0]!.message);
          if (input.kind === 'feat') {
            const report = new ValidationService(this.db).report(id, user);
            const prerequisite = report.findings.find(
              (f) =>
                f.code === 'FEAT_PREREQUISITES' && f.entityId === Number(result.lastInsertRowid)
            );
            if (prerequisite?.state !== 'pass')
              throw new AppError(
                prerequisite?.state === 'fail' ? 400 : 409,
                'FEAT_PREREQUISITES',
                'Pré-requisitos do talento não atendidos ou ainda inconclusivos'
              );
          }
        }
        this.saved(id, user, 'benefit.add');
        return { id: Number(result.lastInsertRowid), kind: input.kind };
      })
      .immediate();
  }
  list(id: number, user?: User) {
    this.characters.requireReadable(id, user);
    this.profile(id);
    const items = [];
    for (const kind of ['feat', 'tool', 'language', 'skill'] as const) {
      const table = kind === 'skill' ? 'character_skill' : 'character_ability',
        column = kind === 'skill' ? 'skill_id' : `lib_${kind}_id`;
      const rows = this.db
        .prepare(
          `SELECT b.id,b.grant_id AS grantId,b.selection_kind AS selectionKind,b.choice_key AS choiceKey,b.proficiency_rank AS proficiencyRank,b.notes,l.id AS localId,e.id AS catalogId,e.name,e.slug,e.deprecated_at AS deprecatedAt FROM ${table} b JOIN lib_${kind} l ON l.id=b.${column} JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE b.character_id=? ORDER BY b.id`
        )
        .all(id) as Array<{ catalogId: number }>;
      items.push(
        ...rows.map((row) => ({ ...row, kind, sources: sources(this.db, row.catalogId) }))
      );
    }
    return {
      items,
      grants: this.db
        .prepare('SELECT * FROM character_rule_grant WHERE character_id=? ORDER BY id')
        .all(id),
      skills: this.db
        .prepare(
          'SELECT skill_id AS skillId,proficiency_rank AS proficiencyRank FROM character_skill_summary WHERE character_id=?'
        )
        .all(id),
      validation: { rulesVerified: false },
    };
  }
  update(
    id: number,
    user: User,
    kind: BenefitInput['kind'],
    instanceId: number,
    input: { notes?: string | null; proficiencyRank?: number }
  ) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const table = kind === 'skill' ? 'character_skill' : 'character_ability',
          column = kind === 'skill' ? 'skill_id' : `lib_${kind}_id`;
        const row = this.db
          .prepare(
            `SELECT notes,proficiency_rank FROM ${table} WHERE character_id=? AND id=? AND ${column} IS NOT NULL`
          )
          .get(id, instanceId) as
          { notes: string | null; proficiency_rank: number | null } | undefined;
        if (!row) throw new AppError(404, 'BENEFIT_NOT_FOUND', 'Benefício não encontrado');
        if (input.proficiencyRank !== undefined && kind !== 'tool' && kind !== 'skill')
          throw new AppError(400, 'INVALID_RANK', 'Graduação apenas para perícias e ferramentas');
        this.db
          .prepare(`UPDATE ${table} SET notes=?,proficiency_rank=? WHERE character_id=? AND id=?`)
          .run(
            input.notes === undefined ? row.notes : input.notes,
            input.proficiencyRank ?? row.proficiency_rank,
            id,
            instanceId
          );
        this.saved(id, user, 'benefit.update');
        return { id: instanceId, kind };
      })
      .immediate();
  }
  private removalContext(kind: BenefitInput['kind'], instanceId: number) {
    return {
      scope: `benefit.remove:${kind}:${instanceId}`,
      root: { table: kind === 'skill' ? 'character_skill' : 'character_ability', id: instanceId },
    };
  }
  previewRemoval(id: number, user: User, kind: BenefitInput['kind'], instanceId: number) {
    this.characters.requireOwner(id, user);
    return new Reconciliation(this.db, {
      ...this.removalContext(kind, instanceId),
      previewPath: `/characters/${id}/benefits/${kind}/${instanceId}/removal-preview`,
    }).preview(id, {}, () => this.applyRemoval(id, user, kind, instanceId));
  }
  remove(
    id: number,
    user: User,
    kind: BenefitInput['kind'],
    instanceId: number,
    confirmationToken?: string
  ) {
    this.characters.requireOwner(id, user);
    return new Reconciliation(this.db, {
      ...this.removalContext(kind, instanceId),
      previewPath: `/characters/${id}/benefits/${kind}/${instanceId}/removal-preview`,
    }).apply(
      id,
      user.id,
      {},
      () => this.applyRemoval(id, user, kind, instanceId),
      confirmationToken
    );
  }
  private applyRemoval(id: number, user: User, kind: BenefitInput['kind'], instanceId: number) {
    this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const table = kind === 'skill' ? 'character_skill' : 'character_ability',
          column = kind === 'skill' ? 'skill_id' : `lib_${kind}_id`;
        const result = this.db
          .prepare(`DELETE FROM ${table} WHERE character_id=? AND id=? AND ${column} IS NOT NULL`)
          .run(id, instanceId);
        if (!result.changes)
          throw new AppError(404, 'BENEFIT_NOT_FOUND', 'Benefício não encontrado');
        this.saved(id, user, 'benefit.remove');
      })
      .immediate();
  }
}
