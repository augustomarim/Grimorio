import type Database from 'better-sqlite3';
import type { Spell } from '@freshmag/one-dndb';
import { BenefitAudit, type Grant } from '../rules/benefits.js';
import type { Finding } from '../rules/validation.js';
import { sourceChoices, magicConfiguration } from '../rules/source-choices.js';
import { AppError } from '../errors.js';
export interface NestedOrigin {
  choiceInstanceId: number;
  nestedChoiceKey: string;
}
export interface SpellOrigin {
  originKind: string;
  originId: number;
  preparationMode: string;
  castingAbilityChoice?: string | null;
}
export class NestedSpells {
  constructor(private db: Database.Database) {}
  check(
    id: number,
    spellId: number,
    origin: SpellOrigin,
    link: NestedOrigin,
    excludeId?: number,
    auditing = false
  ) {
    const choice = this.db
      .prepare(
        'SELECT grant_id,choice_id,option_id FROM character_choice WHERE character_id=? AND id=?'
      )
      .get(id, link.choiceInstanceId) as
      { grant_id: number; choice_id: string; option_id: string } | undefined;
    if (!choice)
      throw new AppError(400, 'INVALID_NESTED_ORIGIN', 'Opção não pertence ao personagem');
    const grant = this.db
      .prepare('SELECT * FROM character_rule_grant WHERE character_id=? AND id=?')
      .get(id, choice.grant_id) as Grant;
    const originId =
      grant.origin_character_class_id ??
      grant.origin_species_id ??
      grant.origin_background_id ??
      grant.origin_character_ability_id;
    if (grant.origin_kind !== origin.originKind || originId !== origin.originId)
      throw new AppError(
        400,
        'NESTED_ORIGIN_MISMATCH',
        'Magia e opção precisam ter a mesma origem'
      );
    const source = new BenefitAudit(this.db).source(id, grant),
      definition = (source ? sourceChoices(source) : []).find((c) => c.id === choice.choice_id),
      option = definition?.options.find((o) => o.id === choice.option_id);
    if (!source || !option || !definition)
      throw new AppError(409, 'NESTED_RULE_UNAVAILABLE', 'Opção não reconhecida no catálogo atual');
    if (source.deprecatedAt && !auditing)
      throw new AppError(400, 'ORIGIN_DEPRECATED', 'Não atribua novas magias a origem depreciada');
    if (source.level < (definition.level ?? 1))
      throw new AppError(400, 'NESTED_LEVEL', 'Opção ainda não liberada');
    const row = this.db
      .prepare(
        'SELECT l.data,l.is_ritual,e.deprecated_at FROM lib_spell l JOIN catalog_entry e ON e.id=l.catalog_entry_id WHERE l.id=?'
      )
      .get(spellId) as
      { data: string; is_ritual: number; deprecated_at: string | null } | undefined;
    if (!row || (!auditing && row.deprecated_at))
      throw new AppError(400, 'INVALID_SPELL', 'Magia inexistente ou depreciada');
    const spell = JSON.parse(row.data) as Spell;
    if ((spell.level === 0) !== (origin.preparationMode === 'cantrip'))
      throw new AppError(
        400,
        'NESTED_PREPARATION',
        'Modo de preparação incompatível com o nível da magia'
      );
    const config =
      source.featSlug === 'magic-initiate'
        ? magicConfiguration(choice.choice_id, choice.option_id)
        : undefined;
    if (config) {
      if (
        origin.castingAbilityChoice !== undefined &&
        origin.castingAbilityChoice !== config.ability
      )
        throw new AppError(
          400,
          'MAGIC_INITIATE_ABILITY',
          'Atributo diferente da escolha compartilhada do talento'
        );
      if (spell.level > 0 && origin.preparationMode !== 'always_prepared')
        throw new AppError(
          400,
          'MAGIC_INITIATE_PREPARATION',
          'A magia de nível 1 de Magic Initiate fica sempre preparada'
        );
    }
    let maximum: number;
    const fixed = option.spellsFixed?.find((s) => link.nestedChoiceKey === `spellsFixed:${s.id}`);
    if (fixed) {
      if (fixed.id !== spell.id)
        throw new AppError(400, 'NESTED_SPELL_OPTION', 'Magia diferente da concessão fixa');
      if (source.level < (fixed.level ?? 1))
        throw new AppError(400, 'NESTED_LEVEL', 'Magia fixa ainda não liberada');
      if (origin.preparationMode !== (spell.level === 0 ? 'cantrip' : 'always_prepared'))
        throw new AppError(
          400,
          'NESTED_PREPARATION',
          'Concessão fixa exige truque ou magia sempre preparada'
        );
      maximum = 1;
    } else {
      const rule = option.spellChoices?.find(
        (r) => link.nestedChoiceKey === `spellChoices:${r.id}`
      );
      if (!rule)
        throw new AppError(
          409,
          'NESTED_RULE_UNAVAILABLE',
          'Chave sem correspondência com a opção selecionada'
        );
      if (source.level < (rule.level ?? 1))
        throw new AppError(400, 'NESTED_LEVEL', 'Escolha de magia ainda não liberada');
      if (
        (rule.spellLevel !== undefined && spell.level !== rule.spellLevel) ||
        (rule.maxSpellLevel !== undefined && spell.level > rule.maxSpellLevel) ||
        (rule.list && !spell.classes?.includes(rule.list)) ||
        (rule.lists && !rule.lists.some((list) => spell.classes?.includes(list))) ||
        (rule.schools && !rule.schools.includes(spell.school)) ||
        (rule.ritual && !row.is_ritual)
      )
        throw new AppError(400, 'NESTED_SPELL_OPTION', 'Magia fora dos critérios da escolha');
      const total = (
        this.db
          .prepare('SELECT SUM(level) AS n FROM character_class WHERE character_id=?')
          .get(id) as { n: number }
      ).n;
      maximum = rule.pickProficiency ? 2 + Math.floor((total - 1) / 4) : rule.pick;
    }
    const count = (
      this.db
        .prepare(
          'SELECT count(*) AS n FROM character_spell WHERE character_id=? AND choice_instance_id=? AND nested_choice_key=? AND id!=?'
        )
        .get(id, link.choiceInstanceId, link.nestedChoiceKey, excludeId ?? -1) as { n: number }
    ).n;
    if (count >= maximum)
      throw new AppError(
        400,
        'NESTED_SPELL_LIMIT',
        'Quantidade de magias excede o limite da escolha'
      );
    return {
      maximum,
      castingAbilityChoice: config?.ability ?? origin.castingAbilityChoice ?? null,
      spell: spell.id,
      choiceInstanceId: link.choiceInstanceId,
      nestedChoiceKey: link.nestedChoiceKey,
    };
  }
  audit(id: number): Finding[] {
    const spells = this.db
      .prepare(
        'SELECT * FROM character_spell WHERE character_id=? AND choice_instance_id IS NOT NULL ORDER BY id'
      )
      .all(id) as {
      id: number;
      lib_spell_id: number;
      choice_instance_id: number;
      nested_choice_key: string;
      origin_kind: string;
      origin_character_class_id: number | null;
      origin_species_id: number | null;
      origin_background_id: number | null;
      origin_character_ability_id: number | null;
      preparation_mode: string;
      casting_ability_choice: string | null;
    }[];
    return spells.map((s) => {
      try {
        const evidence = this.check(
          id,
          s.lib_spell_id,
          {
            originKind: s.origin_kind,
            originId: (s.origin_character_class_id ??
              s.origin_species_id ??
              s.origin_background_id ??
              s.origin_character_ability_id)!,
            preparationMode: s.preparation_mode,
            castingAbilityChoice: s.casting_ability_choice,
          },
          { choiceInstanceId: s.choice_instance_id, nestedChoiceKey: s.nested_choice_key },
          s.id,
          true
        );
        return {
          code: 'NESTED_SPELL_SELECTION',
          state: 'pass' as const,
          entityId: s.id,
          message: 'Magia vinculada à opção e aos critérios da escolha',
          evidence,
        };
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        return {
          code: 'NESTED_SPELL_SELECTION',
          state:
            error.code === 'NESTED_RULE_UNAVAILABLE' ? ('unknown' as const) : ('fail' as const),
          entityId: s.id,
          message: error.message,
          evidence: {
            reason: error.code,
            choiceInstanceId: s.choice_instance_id,
            nestedChoiceKey: s.nested_choice_key,
          },
        };
      }
    });
  }
}
