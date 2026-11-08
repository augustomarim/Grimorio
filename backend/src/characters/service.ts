import { asyncForEach } from '../db/async-array.js';
import type { Database } from '../db/database.js';
import type { User } from '../auth/service.js';
import { Reconciliation } from './reconciliation.js';
import { attributeState, invalidBoosts, assertNoNewInvalidBoosts } from '../rules/attributes.js';
import { AppError } from '../errors.js';
export interface ClassChoice {
  classId: number;
  level: number;
  subclassId?: number | null;
  initial: boolean;
}
export interface LevelChoice {
  classId: number;
  hpMethod: 'first_max' | 'average' | 'roll';
  hpRoll?: number | null;
}
export interface CharacterInput {
  name?: string;
  systemCode?: 'dnd-2024';
  portrait?: string | null;
  campaignSetting?: string | null;
  attributes?: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  speciesId?: number;
  backgroundId?: number | null;
  alignmentId?: number | null;
  classes?: ClassChoice[];
  progression?: LevelChoice[];
  narrative?: {
    backstory?: string | null;
    description?: string | null;
    personality?: string | null;
    motivations?: string | null;
    goals?: string | null;
  };
}
const notFound = () => new AppError(404, 'NOT_FOUND', 'Ficha não encontrada');
const bad = (message: string) => new AppError(400, 'INVALID_CHARACTER', message);
export const publicCondition =
  'c.is_public=1 AND c.publication_blocked_at IS NULL AND u.is_active=1 AND u.email_verified_at IS NOT NULL';
export class CharacterService {
  constructor(private db: Database) {}
  private async core(id: number) {
    return (await this.db
      .prepare(
        'SELECT c.*,u.is_active AS owner_active,u.email_verified_at AS owner_verified FROM character c JOIN app_user u ON u.id=c.owner_id WHERE c.id=?'
      )
      .get(id)) as
      | {
          id: number;
          owner_id: number;
          is_public: number;
          publication_blocked_at: string | null;
          owner_active: number;
          owner_verified: string | null;
        }
      | undefined;
  }
  async requireOwner(id: number, user: User) {
    const row = await this.core(id);
    if (!row || row.owner_id !== user.id) throw notFound();
    return row;
  }
  private async option(kind: string, id: number) {
    const row = (await this.db
      .prepare(
        `SELECT t.*,e.deprecated_at FROM lib_${kind} t JOIN catalog_entry e ON e.id=t.catalog_entry_id WHERE t.id=?`
      )
      .get(id)) as Record<string, unknown> | undefined;
    if (!row) throw bad(`Opção de ${kind} inexistente`);
    if (row.deprecated_at) throw bad(`Opção de ${kind} depreciada; escolha outra`);
    return row;
  }
  private async validateClasses(classes: ClassChoice[], progression: LevelChoice[] | undefined) {
    const total = classes.reduce((n, c) => n + c.level, 0);
    if (total > 20 || total < 1) throw bad('O nível total deve estar entre 1 e 20');
    if (new Set(classes.map((c) => c.classId)).size !== classes.length)
      throw bad('Uma classe não pode aparecer duas vezes');
    if (classes.filter((c) => c.initial).length !== 1)
      throw bad('Selecione exatamente uma classe inicial');
    const records = new Map<number, Record<string, unknown>>();
    for (const c of classes) {
      const cls = await this.option('class', c.classId);
      records.set(c.classId, cls);
      if (c.subclassId) {
        const sub = await this.option('subclass', c.subclassId);
        if (sub.class_id !== c.classId) throw bad('A subclasse não pertence à classe');
        if (c.level < Number(cls.subclass_level))
          throw bad('Nível insuficiente para adquirir a subclasse');
      }
    }
    const levels =
      progression ??
      (total === 1 ? [{ classId: classes[0]!.classId, hpMethod: 'first_max' as const }] : []);
    if (levels.length) {
      if (levels.length !== total) throw bad('O histórico deve conter um registro por nível');
      if (levels[0]!.classId !== classes.find((c) => c.initial)!.classId)
        throw bad('O primeiro nível deve ser da classe inicial');
      for (const c of classes)
        if (levels.filter((l) => l.classId === c.classId).length !== c.level)
          throw bad('O histórico não corresponde aos níveis das classes');
      await asyncForEach(levels, async (l, index) => {
        const cls = records.get(l.classId);
        if (!cls) throw bad('Classe do histórico não selecionada');
        if ((index === 0) !== (l.hpMethod === 'first_max'))
          throw bad('O máximo do dado é reservado ao primeiro nível');
        if (l.hpMethod === 'roll') {
          if (!Number.isInteger(l.hpRoll) || l.hpRoll! < 1 || l.hpRoll! > Number(cls.hit_die))
            throw bad('Rolagem fora do dado de vida da classe');
        } else if (l.hpRoll != null) throw bad('Informe rolagem apenas no método roll');
      });
    }
    return levels;
  }
  private async saveClasses(id: number, classes: ClassChoice[], levels: LevelChoice[]) {
    await this.db.prepare('DELETE FROM character_level_entry WHERE character_id=?').run(id);
    const old = (await this.db
      .prepare('SELECT id,class_id,subclass_id FROM character_class WHERE character_id=?')
      .all(id)) as {
      id: number;
      class_id: number;
      subclass_id: number | null;
    }[];
    for (const current of old)
      if (!classes.some((c) => c.classId === current.class_id))
        await this.db.prepare('DELETE FROM character_class WHERE id=?').run(current.id);
    await this.db
      .prepare('UPDATE character_class SET is_initial_class=0 WHERE character_id=?')
      .run(id);
    const ids = new Map<number, number>();
    for (const cls of classes) {
      const existing = old.find((c) => c.class_id === cls.classId);
      if (existing) {
        await this.db
          .prepare('UPDATE character_class SET level=?,subclass_id=?,is_initial_class=? WHERE id=?')
          .run(cls.level, cls.subclassId ?? null, Number(cls.initial), existing.id);
        ids.set(cls.classId, existing.id);
      } else {
        const row = await this.db
          .prepare(
            'INSERT INTO character_class(character_id,class_id,level,subclass_id,is_initial_class) VALUES(?,?,?,?,?)'
          )
          .run(id, cls.classId, cls.level, cls.subclassId ?? null, Number(cls.initial));
        ids.set(cls.classId, Number(row.insertId));
      }
    }
    await asyncForEach(
      levels,
      async (l, index) =>
        await this.db
          .prepare(
            'INSERT INTO character_level_entry(character_id,character_class_id,sequence_no,hp_method,hp_roll) VALUES(?,?,?,?,?)'
          )
          .run(id, ids.get(l.classId)!, index + 1, l.hpMethod, l.hpRoll ?? null)
    );
  }
  private async narrative(id: number, input: CharacterInput['narrative']) {
    if (!input) return;
    await this.db
      .prepare(
        'INSERT INTO character_narrative(character_id) VALUES(?) ON CONFLICT(character_id) DO NOTHING'
      )
      .run(id);
    for (const key of ['backstory', 'description', 'personality', 'motivations', 'goals'] as const)
      if (input[key] !== undefined)
        await this.db
          .prepare(`UPDATE character_narrative SET ${key}=?,updated_at=? WHERE character_id=?`)
          .run(input[key], new Date().toISOString(), id);
  }
  private async audit(user: User, action: string, id: number) {
    await this.db
      .prepare(
        "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES(?,?,'character',?)"
      )
      .run(user.id, action, id);
  }
  async create(user: User, input: CharacterInput) {
    return await this.db
      .transaction(async () => {
        const system = (await this.db
          .prepare("SELECT id FROM rpg_system WHERE code='dnd-2024' AND is_enabled=1")
          .get()) as
          | {
              id: number;
            }
          | undefined;
        if (!system) throw new AppError(409, 'SYSTEM_UNAVAILABLE', 'Sistema indisponível');
        const revision = (await this.db
          .prepare('SELECT id FROM ruleset_revision ORDER BY id DESC LIMIT 1')
          .get()) as
          | {
              id: number;
            }
          | undefined;
        if (!revision)
          throw new AppError(409, 'CATALOG_EMPTY', 'Importe o catálogo antes de criar fichas');
        await this.option('species', input.speciesId!);
        if (input.backgroundId) await this.option('background', input.backgroundId);
        if (input.alignmentId) await this.option('alignment', input.alignmentId);
        const levels = await this.validateClasses(input.classes!, input.progression);
        const result = await this.db
            .prepare('INSERT INTO character(owner_id,system_id,name,portrait) VALUES(?,?,?,?)')
            .run(user.id, system.id, input.name!, input.portrait ?? null),
          id = Number(result.insertId),
          a = input.attributes!;
        await this.db
          .prepare(
            'INSERT INTO dnd_character(character_id,system_id,strength,dexterity,constitution,intelligence,wisdom,charisma,species_id,background_id,alignment_id,ruleset_revision_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
          )
          .run(
            id,
            system.id,
            a.strength,
            a.dexterity,
            a.constitution,
            a.intelligence,
            a.wisdom,
            a.charisma,
            input.speciesId!,
            input.backgroundId ?? null,
            input.alignmentId ?? null,
            revision.id
          );
        if (input.campaignSetting !== undefined)
          await this.db
            .prepare('UPDATE dnd_character SET campaign_setting=? WHERE character_id=?')
            .run(input.campaignSetting, id);
        await this.saveClasses(id, input.classes!, levels);
        await this.narrative(id, input.narrative);
        await this.audit(user, 'character.create', id);
        return id;
      })
      .immediate();
  }
  async previewChanges(id: number, user: User, input: CharacterInput) {
    await this.requireOwner(id, user);
    return await new Reconciliation(this.db).preview(
      id,
      input,
      async () => await this.applyUpdate(id, user, input)
    );
  }
  async update(id: number, user: User, input: CharacterInput, confirmationToken?: string) {
    await this.requireOwner(id, user);
    return await new Reconciliation(this.db).apply(
      id,
      user.id,
      input,
      async () => await this.applyUpdate(id, user, input),
      confirmationToken
    );
  }
  private async applyUpdate(id: number, user: User, input: CharacterInput) {
    await this.db
      .transaction(async () => {
        await this.requireOwner(id, user);
        const oldInvalidBoosts = await invalidBoosts(this.db, id);
        const time = new Date().toISOString();
        if (input.classes) {
          if (!input.progression && input.classes.reduce((n, c) => n + c.level, 0) > 1)
            throw bad(
              'Ao alterar classes, envie o histórico completo para preservar as escolhas de PV'
            );
          const levels = await this.validateClasses(input.classes, input.progression);
          await this.saveClasses(id, input.classes, levels);
        } else if (input.progression) throw bad('Envie as classes junto com o histórico');
        if (input.attributes) {
          const a = input.attributes;
          await this.db
            .prepare(
              'UPDATE dnd_character SET strength=?,dexterity=?,constitution=?,intelligence=?,wisdom=?,charisma=? WHERE character_id=?'
            )
            .run(a.strength, a.dexterity, a.constitution, a.intelligence, a.wisdom, a.charisma, id);
        }
        for (const [key, column, kind] of [
          ['speciesId', 'species_id', 'species'],
          ['backgroundId', 'background_id', 'background'],
          ['alignmentId', 'alignment_id', 'alignment'],
        ] as const) {
          const value = input[key];
          if (value !== undefined) {
            const current = (await this.db
              .prepare(`SELECT ${column} AS value FROM dnd_character WHERE character_id=?`)
              .get(id)) as {
              value: number | null;
            };
            if (value !== current.value) {
              if (value) await this.option(kind, value);
              await this.db
                .prepare(`UPDATE dnd_character SET ${column}=? WHERE character_id=?`)
                .run(value, id);
            }
          }
        }
        if (input.campaignSetting !== undefined)
          await this.db
            .prepare('UPDATE dnd_character SET campaign_setting=? WHERE character_id=?')
            .run(input.campaignSetting, id);
        if (input.attributes) await assertNoNewInvalidBoosts(this.db, id, oldInvalidBoosts);
        if (input.name !== undefined)
          await this.db.prepare('UPDATE character SET name=? WHERE id=?').run(input.name, id);
        if (input.portrait !== undefined)
          await this.db
            .prepare('UPDATE character SET portrait=? WHERE id=?')
            .run(input.portrait, id);
        await this.narrative(id, input.narrative);
        await this.db
          .prepare(
            'UPDATE dnd_character SET ruleset_revision_id=(SELECT id FROM ruleset_revision ORDER BY id DESC LIMIT 1) WHERE character_id=?'
          )
          .run(id);
        await this.db.prepare('UPDATE character SET updated_at=? WHERE id=?').run(time, id);
        await this.audit(user, 'character.update', id);
      })
      .immediate();
  }
  async requireReadable(id: number, user?: User) {
    const core = await this.core(id);
    if (!core) throw notFound();
    if (
      !(user && (user.id === core.owner_id || user.role === 'admin')) &&
      !(core.is_public && !core.publication_blocked_at && core.owner_active && core.owner_verified)
    )
      throw notFound();
    return core;
  }
  async detail(id: number, user?: User) {
    const core = await this.requireReadable(id, user);
    const sheet = (await this.db.prepare('SELECT * FROM character_summary WHERE id=?').get(id)) as
      Record<string, unknown> | undefined;
    if (!sheet) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Perfil da ficha incompleto');
    const { owner_active: _, owner_verified: __, ...safeCore } = core;
    const count = (
      (await this.db
        .prepare('SELECT count(*) AS count FROM character_level_entry WHERE character_id=?')
        .get(id)) as {
        count: number;
      }
    ).count;
    return {
      ...sheet,
      ...safeCore,
      baseAttributes: (await attributeState(this.db, id)).base,
      classes: await this.db
        .prepare(
          'SELECT cc.*,e.name,sc.name AS subclass_name FROM character_class cc JOIN lib_class cl ON cl.id=cc.class_id JOIN catalog_entry e ON e.id=cl.catalog_entry_id LEFT JOIN lib_subclass sub ON sub.id=cc.subclass_id LEFT JOIN catalog_entry sc ON sc.id=sub.catalog_entry_id WHERE cc.character_id=? ORDER BY cc.is_initial_class DESC,cc.id'
        )
        .all(id),
      narrative:
        (await this.db
          .prepare(
            'SELECT backstory,description,personality,motivations,goals FROM character_narrative WHERE character_id=?'
          )
          .get(id)) ?? null,
      hitPoints:
        count === sheet.total_level
          ? await this.db
              .prepare(
                'SELECT base_hit_points,modeled_max_hit_points FROM character_hit_point_summary WHERE character_id=?'
              )
              .get(id)
          : null,
      validation: {
        rulesVerified: false,
        message:
          'Construção persistida; validação integral das regras D&D ainda não está disponível.',
      },
    };
  }
  async list(user: User | undefined, page: number, limit: number, publicOnly: boolean, q?: string) {
    const filter = publicOnly ? publicCondition : 'c.owner_id=?';
    const args: unknown[] = publicOnly ? [] : [user!.id];
    const term = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
    args.push(term, term);
    const where = `${filter} AND (CAST(? AS TEXT) IS NULL OR c.name ILIKE ? ESCAPE '\\')`;
    return {
      items: await this.db
        .prepare(
          `SELECT c.id,c.name,c.portrait,c.is_public,s.code AS system,c.created_at,c.updated_at,d.total_level FROM character c JOIN app_user u ON u.id=c.owner_id JOIN rpg_system s ON s.id=c.system_id LEFT JOIN character_summary d ON d.id=c.id WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`
        )
        .all(...args, limit, (page - 1) * limit),
      page,
      limit,
      total: (
        (await this.db
          .prepare(
            `SELECT count(*) AS count FROM character c JOIN app_user u ON u.id=c.owner_id WHERE ${where}`
          )
          .get(...args)) as {
          count: number;
        }
      ).count,
    };
  }
  async remove(id: number, user: User) {
    await this.db
      .transaction(async () => {
        await this.requireOwner(id, user);
        await this.db.prepare('DELETE FROM character WHERE id=?').run(id);
        await this.audit(user, 'character.delete', id);
      })
      .immediate();
  }
  async publication(id: number, user: User, action: 'publish' | 'unpublish' | 'hide' | 'unblock') {
    await this.db
      .transaction(async () => {
        const row = await this.core(id);
        if (!row) throw notFound();
        if (action === 'hide' || action === 'unblock') {
          if (user.role !== 'admin')
            throw new AppError(403, 'FORBIDDEN', 'Operação restrita à administração');
          await this.db
            .prepare(
              'UPDATE character SET is_public=0,publication_blocked_at=?,updated_at=? WHERE id=?'
            )
            .run(action === 'hide' ? new Date().toISOString() : null, new Date().toISOString(), id);
        } else {
          await this.requireOwner(id, user);
          if (action === 'publish' && (!user.email_verified_at || row.publication_blocked_at))
            throw new AppError(
              403,
              'PUBLICATION_DENIED',
              'Confirme seu e-mail e verifique se a publicação está liberada'
            );
          await this.db
            .prepare('UPDATE character SET is_public=?,updated_at=? WHERE id=?')
            .run(Number(action === 'publish'), new Date().toISOString(), id);
        }
        await this.audit(user, `character.${action}`, id);
      })
      .immediate();
  }
}
