import type Database from 'better-sqlite3';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { BenefitAudit, type Grant } from '../rules/benefits.js';
import type { Finding } from '../rules/validation.js';
import { NestedSpells } from '../spells/nested.js';
import { Reconciliation } from '../characters/reconciliation.js';
import { AppError } from '../errors.js';
export interface ChoiceInput {
  grantId: number;
  choiceId: string;
  optionId: string;
}
interface ChoiceRow {
  id: number;
  grant_id: number;
  choice_id: string;
  option_id: string;
}
export class ChoiceService {
  constructor(private db: Database.Database) {}
  private grants(id: number) {
    return this.db
      .prepare('SELECT * FROM character_rule_grant WHERE character_id=? ORDER BY id')
      .all(id) as Grant[];
  }
  private profile(id: number) {
    if (!this.db.prepare('SELECT 1 FROM dnd_character WHERE character_id=?').get(id))
      throw new AppError(409, 'CHOICES_UNAVAILABLE', 'Escolhas disponíveis apenas para D&D');
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
  inspect(id: number) {
    const grants = this.grants(id),
      audit = new BenefitAudit(this.db),
      selected = this.db
        .prepare('SELECT * FROM character_choice WHERE character_id=? ORDER BY id')
        .all(id) as ChoiceRow[];
    const findings: Finding[] = [],
      options = [];
    for (const grant of grants) {
      const source = audit.source(id, grant);
      if (!source) continue;
      for (const choice of source.data.choices ?? []) {
        options.push({
          grantId: grant.id,
          choiceId: choice.id,
          name: choice.name,
          pick: choice.pick ?? 1,
          requiredLevel: choice.level ?? 1,
          available: source.level >= (choice.level ?? 1),
          source: choice.source ?? null,
          options: choice.options,
          scope: source.identity,
        });
      }
    }
    const nestedFindings = new NestedSpells(this.db).audit(id);
    for (const row of selected) {
      const grant = grants.find((g) => g.id === row.grant_id),
        source = grant ? audit.source(id, grant) : undefined;
      const choice = source?.data.choices?.find((c) => c.id === row.choice_id),
        option = choice?.options.find((o) => o.id === row.option_id);
      const recognized = !!option;
      findings.push({
        code: 'NESTED_OPTION',
        state: recognized ? 'pass' : 'unknown',
        entityId: row.id,
        message: 'Opção escolhida reconhecida na origem atual',
        evidence: { choiceId: row.choice_id, optionId: row.option_id },
      });
      if (!source || !choice || !option || !grant) continue;
      findings.push({
        code: 'NESTED_OPTION_LEVEL',
        state: source.level >= (choice.level ?? 1) ? 'pass' : 'fail',
        entityId: row.id,
        message: 'Nível atual para a escolha',
        evidence: { level: source.level, required: choice.level ?? 1 },
      });
      for (const spell of option.spellsFixed ?? []) {
        const column =
          grant.origin_kind === 'class' || grant.origin_kind === 'subclass'
            ? 'origin_character_class_id'
            : grant.origin_kind === 'species'
              ? 'origin_species_id'
              : grant.origin_kind === 'background'
                ? 'origin_background_id'
                : 'origin_character_ability_id';
        const origin =
          grant.origin_character_class_id ??
          grant.origin_species_id ??
          grant.origin_background_id ??
          grant.origin_character_ability_id;
        const instances = this.db
          .prepare(
            `SELECT s.id FROM character_spell s JOIN lib_spell l ON l.id=s.lib_spell_id JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE s.character_id=? AND s.origin_kind=? AND s.${column}=? AND e.slug=? AND s.choice_instance_id=? AND s.nested_choice_key=?`
          )
          .all(id, grant.origin_kind, origin, spell.id, row.id, `spellsFixed:${spell.id}`);
        const unlocked = source.level >= (spell.level ?? 1);
        findings.push({
          code: 'NESTED_FIXED_SPELL',
          state:
            !unlocked && instances.length
              ? 'fail'
              : unlocked && instances.length
                ? 'pass'
                : 'unknown',
          entityId: row.id,
          message: unlocked
            ? 'Magia concedida pela opção: presença na mesma origem'
            : 'Magia da opção ainda não liberada no nível atual',
          evidence: {
            spell: spell.id,
            requiredLevel: spell.level ?? 1,
            currentLevel: source.level,
            present: instances.length > 0,
            free: spell.free ?? null,
          },
        });
      }
      if (option.spellChoices?.length) {
        const linked = nestedFindings.filter(
          (f) =>
            (f.evidence as { choiceInstanceId?: number; nestedChoiceKey?: string })
              ?.choiceInstanceId === row.id &&
            (f.evidence as { nestedChoiceKey?: string })?.nestedChoiceKey?.startsWith(
              'spellChoices:'
            )
        );
        findings.push({
          code: 'NESTED_SPELL_CHOICES',
          state: linked.some((f) => f.state === 'fail')
            ? 'fail'
            : linked.length && linked.every((f) => f.state === 'pass')
              ? 'pass'
              : 'unknown',
          entityId: row.id,
          message:
            'Critérios das magias explicitamente vinculadas; escolhas vazias não certificam preenchimento',
          evidence: option.spellChoices,
        });
      }
    }
    findings.push(...nestedFindings);
    return { selected, options, findings };
  }
  list(id: number, user?: User) {
    return this.db
      .transaction(() => {
        new CharacterService(this.db).requireReadable(id, user);
        this.profile(id);
        return { ...this.inspect(id), rulesVerified: false };
      })
      .deferred();
  }
  add(id: number, user: User, input: ChoiceInput) {
    return this.db
      .transaction(() => {
        new CharacterService(this.db).requireOwner(id, user);
        this.profile(id);
        const grants = this.grants(id),
          grant = grants.find((g) => g.id === input.grantId),
          audit = new BenefitAudit(this.db),
          source = grant ? audit.source(id, grant) : undefined;
        if (!grant || !source)
          throw new AppError(400, 'INVALID_ORIGIN', 'Concessão não pertence ao personagem');
        if (source.deprecatedAt)
          throw new AppError(
            400,
            'ORIGIN_DEPRECATED',
            'Não é possível adquirir opção de origem depreciada'
          );
        const choice = source.data.choices?.find((c) => c.id === input.choiceId),
          option = choice?.options.find((o) => o.id === input.optionId);
        if (!choice || !option)
          throw new AppError(400, 'INVALID_CHOICE', 'Escolha ou opção não encontrada na origem');
        if (source.level < (choice.level ?? 1))
          throw new AppError(400, 'CHOICE_LEVEL', 'Nível insuficiente para a escolha');
        if (grant.acquisition_context === 'multiclass_entry')
          throw new AppError(
            409,
            'CHOICE_CONTEXT_UNVERIFIED',
            'Elegibilidade de escolhas na entrada multiclasse ainda não verificada'
          );
        const groupIds = grants
          .filter((g) => audit.source(id, g)?.identity === source.identity)
          .map((g) => g.id);
        const existing = (
          this.db
            .prepare(
              'SELECT grant_id,option_id FROM character_choice WHERE character_id=? AND choice_id=?'
            )
            .all(id, input.choiceId) as { grant_id: number; option_id: string }[]
        ).filter((r) => groupIds.includes(r.grant_id));
        if (
          existing.some((r) => r.option_id === input.optionId) ||
          existing.length >= (choice.pick ?? 1)
        )
          throw new AppError(
            400,
            'CHOICE_LIMIT',
            'Opção repetida ou limite de escolhas excedido na origem'
          );
        const result = this.db
          .prepare(
            'INSERT INTO character_choice(character_id,grant_id,choice_id,option_id) VALUES(?,?,?,?)'
          )
          .run(id, input.grantId, input.choiceId, input.optionId);
        this.saved(id, user, 'choice.add');
        return { id: Number(result.lastInsertRowid) };
      })
      .immediate();
  }
  previewRemoval(id: number, user: User, instanceId: number) {
    new CharacterService(this.db).requireOwner(id, user);
    return new Reconciliation(this.db, {
      scope: `choice.remove:${instanceId}`,
      root: { table: 'character_choice', id: instanceId },
    }).preview(id, {}, () => this.applyRemoval(id, user, instanceId));
  }
  remove(id: number, user: User, instanceId: number, confirmationToken?: string) {
    new CharacterService(this.db).requireOwner(id, user);
    return new Reconciliation(this.db, {
      scope: `choice.remove:${instanceId}`,
      root: { table: 'character_choice', id: instanceId },
    }).apply(id, user.id, {}, () => this.applyRemoval(id, user, instanceId), confirmationToken);
  }
  private applyRemoval(id: number, user: User, instanceId: number) {
    this.db
      .transaction(() => {
        new CharacterService(this.db).requireOwner(id, user);
        this.profile(id);
        if (
          !this.db
            .prepare('DELETE FROM character_choice WHERE character_id=? AND id=?')
            .run(id, instanceId).changes
        )
          throw new AppError(404, 'CHOICE_NOT_FOUND', 'Escolha não encontrada');
        this.saved(id, user, 'choice.remove');
      })
      .immediate();
  }
}
