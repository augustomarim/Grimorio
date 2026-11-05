import type Database from 'better-sqlite3';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { AppError } from '../errors.js';
import { NestedSpells, type NestedOrigin } from './nested.js';
import { sources } from '../catalog/routes.js';
export interface SpellInput {
  spellId: number;
  choiceInstanceId?: number;
  nestedChoiceKey?: string;
  originKind: 'class' | 'subclass' | 'species' | 'background' | 'feat';
  originId: number;
  preparationMode: 'cantrip' | 'selectable' | 'always_prepared' | 'granted';
  isPrepared?: boolean;
  castingAbilityChoice?: string | null;
  notes?: string | null;
}
export interface BookInput {
  spellId: number;
  characterClassId: number;
  notes?: string | null;
}
export interface SpellChanges {
  notes?: string | null;
  isPrepared?: boolean;
  castingAbilityChoice?: string | null;
}
export class SpellService {
  private characters: CharacterService;
  constructor(private db: Database.Database) {
    this.characters = new CharacterService(db);
  }
  private profile(id: number) {
    if (!this.db.prepare('SELECT 1 FROM dnd_character WHERE character_id=?').get(id))
      throw new AppError(409, 'SPELLS_UNAVAILABLE', 'Magias disponíveis apenas para D&D');
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
  private spell(spellId: number) {
    const row = this.db
      .prepare(
        'SELECT s.level,e.deprecated_at FROM lib_spell s JOIN catalog_entry e ON e.id=s.catalog_entry_id WHERE s.id=?'
      )
      .get(spellId) as { level: number; deprecated_at: string | null } | undefined;
    if (!row || row.deprecated_at)
      throw new AppError(400, 'INVALID_SPELL', 'Magia inexistente ou depreciada');
    return row;
  }
  private origin(id: number, input: SpellInput) {
    const values: Array<number | null> = [null, null, null, null, null, null];
    if (input.originKind === 'class' || input.originKind === 'subclass') {
      const row = this.db
        .prepare('SELECT id,subclass_id FROM character_class WHERE character_id=? AND id=?')
        .get(id, input.originId) as { id: number; subclass_id: number | null } | undefined;
      if (!row || (input.originKind === 'subclass' && !row.subclass_id))
        throw new AppError(400, 'INVALID_ORIGIN', 'Classe ou subclasse não pertence ao personagem');
      values[0] = row.id;
      if (input.originKind === 'subclass') values[1] = row.subclass_id;
    } else if (input.originKind === 'feat') {
      const row = this.db
        .prepare(
          'SELECT lib_feat_id FROM character_ability WHERE character_id=? AND id=? AND lib_feat_id IS NOT NULL'
        )
        .get(id, input.originId) as { lib_feat_id: number } | undefined;
      if (!row) throw new AppError(400, 'INVALID_ORIGIN', 'Talento não pertence ao personagem');
      values[4] = input.originId;
      values[5] = row.lib_feat_id;
    } else {
      const column = input.originKind === 'species' ? 'species_id' : 'background_id';
      if (
        !this.db
          .prepare(`SELECT 1 FROM dnd_character WHERE character_id=? AND ${column}=?`)
          .get(id, input.originId)
      )
        throw new AppError(400, 'INVALID_ORIGIN', 'Origem não pertence ao personagem');
      values[input.originKind === 'species' ? 2 : 3] = input.originId;
    }
    return values;
  }
  list(id: number, user: User | undefined, book: boolean, page: number, limit: number) {
    this.characters.requireReadable(id, user);
    this.profile(id);
    const table = book ? 'character_spellbook_entry' : 'character_spell';
    const rows = this.db
      .prepare(
        `SELECT b.*,s.level,s.school,e.id AS catalog_id,e.name,e.slug,e.deprecated_at FROM ${table} b JOIN lib_spell s ON s.id=b.lib_spell_id JOIN catalog_entry e ON e.id=s.catalog_entry_id WHERE b.character_id=? ORDER BY s.level,e.name,b.id LIMIT ? OFFSET ?`
      )
      .all(id, limit, (page - 1) * limit) as Array<
      Record<string, unknown> & {
        catalog_id: number;
        preparation_mode?: string;
        is_prepared?: number;
      }
    >;
    return {
      items: rows.map((row) => ({
        ...row,
        ...(!book
          ? {
              effectivePrepared:
                row.preparation_mode === 'always_prepared' ||
                (row.preparation_mode === 'selectable' && !!row.is_prepared),
            }
          : {}),
        sources: sources(this.db, row.catalog_id),
      })),
      page,
      limit,
      total: (
        this.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE character_id=?`).get(id) as {
          n: number;
        }
      ).n,
      validation: { rulesVerified: false },
    };
  }
  add(id: number, user: User, input: SpellInput) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const spell = this.spell(input.spellId),
          origin = this.origin(id, input);
        if ((spell.level === 0) !== (input.preparationMode === 'cantrip'))
          throw new AppError(
            400,
            'INVALID_PREPARATION',
            'Truques exigem modo cantrip; magias de nível maior não aceitam esse modo'
          );
        if (input.isPrepared && input.preparationMode !== 'selectable')
          throw new AppError(
            400,
            'INVALID_PREPARATION',
            'Apenas magias selecionáveis aceitam preparação manual'
          );
        if ((input.choiceInstanceId !== undefined) !== (input.nestedChoiceKey !== undefined))
          throw new AppError(400, 'INVALID_NESTED_ORIGIN', 'Informe opção e chave juntas');
        if (input.choiceInstanceId !== undefined)
          new NestedSpells(this.db).check(id, input.spellId, input, {
            choiceInstanceId: input.choiceInstanceId,
            nestedChoiceKey: input.nestedChoiceKey!,
          });
        const result = this.db
          .prepare(
            'INSERT INTO character_spell(character_id,lib_spell_id,origin_kind,origin_character_class_id,origin_subclass_id,origin_species_id,origin_background_id,origin_character_ability_id,origin_feat_id,preparation_mode,is_prepared,casting_ability_choice,notes,choice_instance_id,nested_choice_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          )
          .run(
            id,
            input.spellId,
            input.originKind,
            ...origin,
            input.preparationMode,
            Number(input.isPrepared ?? false),
            input.castingAbilityChoice ?? null,
            input.notes ?? null,
            input.choiceInstanceId ?? null,
            input.nestedChoiceKey ?? null
          );
        this.saved(id, user, 'spell.add');
        return { id: Number(result.lastInsertRowid) };
      })
      .immediate();
  }
  bindChoice(id: number, user: User, instanceId: number, link: NestedOrigin) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const row = this.db
          .prepare('SELECT * FROM character_spell WHERE character_id=? AND id=?')
          .get(id, instanceId) as
          | {
              lib_spell_id: number;
              origin_kind: string;
              origin_character_class_id: number | null;
              origin_species_id: number | null;
              origin_background_id: number | null;
              origin_character_ability_id: number | null;
              preparation_mode: string;
              choice_instance_id: number | null;
              nested_choice_key: string | null;
            }
          | undefined;
        if (!row) throw new AppError(404, 'SPELL_NOT_FOUND', 'Magia não encontrada');
        if (
          row.choice_instance_id !== null &&
          (row.choice_instance_id !== link.choiceInstanceId ||
            row.nested_choice_key !== link.nestedChoiceKey)
        )
          throw new AppError(
            409,
            'SPELL_ALREADY_LINKED',
            'Magia já vinculada; remova e registre novamente para corrigir a origem'
          );
        new NestedSpells(this.db).check(
          id,
          row.lib_spell_id,
          {
            originKind: row.origin_kind,
            originId: (row.origin_character_class_id ??
              row.origin_species_id ??
              row.origin_background_id ??
              row.origin_character_ability_id)!,
            preparationMode: row.preparation_mode,
          },
          link,
          instanceId
        );
        this.db
          .prepare(
            'UPDATE character_spell SET choice_instance_id=?,nested_choice_key=? WHERE character_id=? AND id=?'
          )
          .run(link.choiceInstanceId, link.nestedChoiceKey, id, instanceId);
        this.saved(id, user, 'spell.link-choice');
        return { id: instanceId };
      })
      .immediate();
  }
  addBook(id: number, user: User, input: BookInput) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const spell = this.spell(input.spellId);
        const wizard = this.db
          .prepare(
            "SELECT 1 FROM character_class cc JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id WHERE cc.character_id=? AND cc.id=? AND e.slug='wizard'"
          )
          .get(id, input.characterClassId);
        if (!wizard || spell.level === 0)
          throw new AppError(
            400,
            'INVALID_SPELLBOOK',
            'Grimório exige classe mago do personagem e magia de nível maior que zero'
          );
        const result = this.db
          .prepare(
            'INSERT INTO character_spellbook_entry(character_id,character_class_id,lib_spell_id,notes) VALUES(?,?,?,?)'
          )
          .run(id, input.characterClassId, input.spellId, input.notes ?? null);
        this.saved(id, user, 'spellbook.add');
        return { id: Number(result.lastInsertRowid) };
      })
      .immediate();
  }
  update(id: number, user: User, instanceId: number, book: boolean, input: SpellChanges) {
    return this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const table = book ? 'character_spellbook_entry' : 'character_spell';
        const row = this.db
          .prepare(`SELECT * FROM ${table} WHERE character_id=? AND id=?`)
          .get(id, instanceId) as
          | {
              notes: string | null;
              preparation_mode: string;
              is_prepared: number;
              casting_ability_choice: string | null;
            }
          | undefined;
        if (!row) throw new AppError(404, 'SPELL_NOT_FOUND', 'Registro não encontrado');
        if (book)
          this.db
            .prepare('UPDATE character_spellbook_entry SET notes=? WHERE character_id=? AND id=?')
            .run(input.notes === undefined ? row.notes : input.notes, id, instanceId);
        else {
          if (input.isPrepared !== undefined && row.preparation_mode !== 'selectable')
            throw new AppError(400, 'INVALID_PREPARATION', 'Modo não permite preparação manual');
          this.db
            .prepare(
              'UPDATE character_spell SET notes=?,is_prepared=?,casting_ability_choice=? WHERE character_id=? AND id=?'
            )
            .run(
              input.notes === undefined ? row.notes : input.notes,
              input.isPrepared === undefined ? row.is_prepared : Number(input.isPrepared),
              input.castingAbilityChoice === undefined
                ? row.casting_ability_choice
                : input.castingAbilityChoice,
              id,
              instanceId
            );
        }
        this.saved(id, user, book ? 'spellbook.update' : 'spell.update');
        return { id: instanceId };
      })
      .immediate();
  }
  remove(id: number, user: User, instanceId: number, book: boolean) {
    this.db
      .transaction(() => {
        this.characters.requireOwner(id, user);
        this.profile(id);
        const table = book ? 'character_spellbook_entry' : 'character_spell';
        if (
          !this.db.prepare(`DELETE FROM ${table} WHERE character_id=? AND id=?`).run(id, instanceId)
            .changes
        )
          throw new AppError(404, 'SPELL_NOT_FOUND', 'Registro não encontrado');
        this.saved(id, user, book ? 'spellbook.remove' : 'spell.remove');
      })
      .immediate();
  }
}
