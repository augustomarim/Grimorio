import type Database from 'better-sqlite3';
import { BenefitAudit, type Grant } from './benefits.js';
import { AppError } from '../errors.js';
export const abilities = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;
export type Ability = (typeof abilities)[number];
export const abilityName = (name: string) =>
  ({
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma',
  })[name.toLowerCase()] ?? name.toLowerCase();
export function invalidBoosts(db: Database.Database, id: number) {
  return db
    .prepare(
      'SELECT b.id FROM character_ability_boost b LEFT JOIN character_ability_boost_application a ON a.boost_id=b.id WHERE b.character_id=? AND (a.boost_id IS NULL OR a.applied_points<b.amount)'
    )
    .all(id) as { id: number }[];
}
export function assertNoNewInvalidBoosts(
  db: Database.Database,
  id: number,
  previous: { id: number }[]
) {
  const known = new Set(previous.map((r) => r.id));
  if (invalidBoosts(db, id).some((r) => !known.has(r.id)))
    throw new AppError(
      400,
      'ATTRIBUTE_CAP',
      'A escolha ultrapassa um limite de atributo ou invalida um bônus existente'
    );
}
export function attributeState(db: Database.Database, id: number, eligibleFeats?: Set<number>) {
  const base = db
    .prepare(
      'SELECT strength,dexterity,constitution,intelligence,wisdom,charisma FROM dnd_character WHERE character_id=?'
    )
    .get(id) as Record<Ability, number> | undefined;
  if (!base) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Perfil D&D incompleto');
  if (!eligibleFeats) {
    const effective = db
      .prepare(
        'SELECT strength,dexterity,constitution,intelligence,wisdom,charisma FROM character_effective_attributes WHERE character_id=?'
      )
      .get(id) as Record<Ability, number>;
    return { base, effective };
  }
  const effective = { ...base };
  const rows = db
    .prepare(
      "SELECT b.*,g.origin_character_ability_id,CAST(json_extract(j.value,'$.max') AS INTEGER) AS cap FROM character_ability_boost b JOIN character_rule_grant g ON g.id=b.grant_id AND g.character_id=b.character_id JOIN character_rule_source rs ON rs.grant_id=g.id JOIN json_each(rs.source_data,'$.abilityBoosts') j ON json_extract(j.value,'$.id')=b.rule_id WHERE b.character_id=? ORDER BY g.acquired_at_level,g.id,b.rule_id,b.id"
    )
    .all(id) as {
    ability: Ability;
    amount: number;
    cap: number;
    origin_character_ability_id: number | null;
  }[];
  for (const row of rows)
    if (
      (row.origin_character_ability_id === null ||
        eligibleFeats.has(row.origin_character_ability_id)) &&
      row.cap >= 1 &&
      row.cap <= 30 &&
      effective[row.ability] < row.cap
    )
      effective[row.ability] = Math.min(row.cap, effective[row.ability] + row.amount);
  return { base, effective };
}
export class AttributeChoices {
  constructor(private db: Database.Database) {}
  select(id: number, grantId: number, ruleId: string, selected: Ability[]) {
    const grant = this.db
      .prepare('SELECT * FROM character_rule_grant WHERE character_id=? AND id=?')
      .get(id, grantId) as Grant | undefined;
    const audit = new BenefitAudit(this.db),
      source = grant ? audit.source(id, grant) : undefined;
    if (!grant || !source)
      throw new AppError(400, 'INVALID_GRANT', 'Concessão não pertence ao personagem');
    const rule = source.data.abilityBoosts?.find((r) => r.id === ruleId);
    if (!rule)
      throw new AppError(400, 'UNKNOWN_EFFECT', 'Aumento de atributo não encontrado na origem');
    if (source.deprecatedAt && selected.length)
      throw new AppError(400, 'ORIGIN_DEPRECATED', 'Origem depreciada não aceita novas escolhas');
    if (selected.length > rule.points)
      throw new AppError(400, 'EFFECT_BUDGET', 'Pontos acima do limite da escolha');
    for (const ability of selected) {
      if (
        !abilities.includes(ability) ||
        (rule.from && !rule.from.map(abilityName).includes(ability))
      )
        throw new AppError(400, 'EFFECT_OPTION', 'Atributo não permitido pela escolha');
      if (selected.filter((a) => a === ability).length > (rule.perAbility ?? 1))
        throw new AppError(400, 'EFFECT_DISTRIBUTION', 'Pontos por atributo acima do limite');
    }
    const pool = (
      this.db.prepare('SELECT * FROM character_rule_grant WHERE character_id=?').all(id) as Grant[]
    )
      .filter((g) => audit.source(id, g)?.identity === source.identity)
      .map((g) => g.id);
    const before = invalidBoosts(this.db, id);
    for (const key of pool)
      this.db
        .prepare(
          'DELETE FROM character_ability_boost WHERE character_id=? AND grant_id=? AND rule_id=?'
        )
        .run(id, key, ruleId);
    for (const ability of new Set(selected))
      this.db
        .prepare(
          'INSERT INTO character_ability_boost(character_id,grant_id,rule_id,ability,amount) VALUES(?,?,?,?,?)'
        )
        .run(id, grantId, ruleId, ability, selected.filter((a) => a === ability).length);
    assertNoNewInvalidBoosts(this.db, id, before);
    return attributeState(this.db, id);
  }
  audit(id: number) {
    const grants = this.db
        .prepare('SELECT * FROM character_rule_grant WHERE character_id=?')
        .all(id) as Grant[],
      sources = new BenefitAudit(this.db);
    const rows = this.db
      .prepare('SELECT * FROM character_ability_boost WHERE character_id=?')
      .all(id) as {
      id: number;
      grant_id: number;
      rule_id: string;
      ability: string;
      amount: number;
    }[];
    const findings = [];
    for (const row of rows) {
      const grant = grants.find((g) => g.id === row.grant_id),
        source = grant ? sources.source(id, grant) : undefined,
        rule = source?.data.abilityBoosts?.find((r) => r.id === row.rule_id);
      const pool = grants
          .filter((g) => sources.source(id, g)?.identity === source?.identity)
          .map((g) => g.id),
        allocated = rows.filter((r) => pool.includes(r.grant_id) && r.rule_id === row.rule_id),
        total = allocated.reduce((n, r) => n + r.amount, 0);
      const per = allocated
        .filter((r) => r.ability === row.ability)
        .reduce((n, r) => n + r.amount, 0);
      const valid =
        rule &&
        total <= rule.points &&
        per <= (rule.perAbility ?? 1) &&
        (!rule.from || rule.from.map(abilityName).includes(row.ability));
      findings.push({
        code: 'ABILITY_BOOST_CHOICE',
        state: !rule ? ('unknown' as const) : valid ? ('pass' as const) : ('fail' as const),
        entityId: row.id,
        message: 'Pontos, distribuição e atributos permitidos no catálogo',
      });
    }
    for (const row of invalidBoosts(this.db, id))
      findings.push({
        code: 'ABILITY_BOOST_CAP',
        state: 'fail' as const,
        entityId: row.id,
        message: 'Bônus não aplicado integralmente: limite ou regra ausente',
      });
    return findings;
  }
}
