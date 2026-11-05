import type { Database } from '../db/database.js';
export interface ItemRow {
  id: number;
  character_id: number;
  item_id: number;
  quantity: number;
  equipped: number;
  notes: string | null;
  catalog_id: number;
  slug: string;
  name: string;
  kind: string;
  rarity: string | null;
  deprecated_at: string | null;
  cost_cp: number | null;
  weight: number | null;
}
export interface InventoryQuery {
  page: number;
  limit: number;
  equipped?: boolean;
  q?: string;
}
const selection = `SELECT ci.id,ci.character_id,ci.lib_item_id AS item_id,ci.quantity,ci.equipped,ci.notes,
 e.id AS catalog_id,e.slug,e.name,e.deprecated_at,i.kind,i.rarity,i.cost_cp,i.weight
 FROM character_item ci JOIN lib_item i ON i.id=ci.lib_item_id
 JOIN catalog_entry e ON e.id=i.catalog_entry_id`;
export class InventoryRepository {
  constructor(private db: Database) {}
  async transaction<T>(operation: () => T | Promise<T>): Promise<T> {
    return await this.db.transaction(operation).immediate();
  }
  async hasProfile(characterId: number) {
    return !!(await this.db
      .prepare('SELECT 1 FROM dnd_character WHERE character_id=?')
      .get(characterId));
  }
  async item(itemId: number) {
    return (await this.db
      .prepare(
        'SELECT i.id,e.deprecated_at FROM lib_item i JOIN catalog_entry e ON e.id=i.catalog_entry_id WHERE i.id=?'
      )
      .get(itemId)) as
      | {
          id: number;
          deprecated_at: string | null;
        }
      | undefined;
  }
  async find(characterId: number, instanceId: number) {
    return (await this.db
      .prepare(`${selection} WHERE ci.character_id=? AND ci.id=?`)
      .get(characterId, instanceId)) as ItemRow | undefined;
  }
  async list(characterId: number, query: InventoryQuery) {
    const equipped = query.equipped === undefined ? null : Number(query.equipped);
    const term = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : null;
    const where =
      "ci.character_id=? AND (CAST(? AS TEXT) IS NULL OR ci.equipped=?) AND (CAST(? AS TEXT) IS NULL OR e.name ILIKE ? ESCAPE '\\')";
    const args = [characterId, equipped, equipped, term, term];
    const items = (await this.db
      .prepare(`${selection} WHERE ${where} ORDER BY ci.id LIMIT ? OFFSET ?`)
      .all(...args, query.limit, (query.page - 1) * query.limit)) as ItemRow[];
    const total = (
      (await this.db
        .prepare(
          `SELECT count(*) AS total FROM character_item ci JOIN lib_item i ON i.id=ci.lib_item_id JOIN catalog_entry e ON e.id=i.catalog_entry_id WHERE ${where}`
        )
        .get(...args)) as {
        total: number;
      }
    ).total;
    return { items, total };
  }
  async sources(catalogId: number) {
    return await this.db
      .prepare(
        'SELECT s.id,s.slug,s.name,s.source_type AS type,s.edition FROM catalog_entry_source es JOIN rules_source s ON s.id=es.source_id WHERE es.catalog_entry_id=? ORDER BY s.name'
      )
      .all(catalogId);
  }
  async insert(
    characterId: number,
    itemId: number,
    quantity: number,
    equipped: boolean,
    notes: string | null
  ) {
    return Number(
      (
        await this.db
          .prepare(
            'INSERT INTO character_item(character_id,lib_item_id,quantity,equipped,notes) VALUES(?,?,?,?,?)'
          )
          .run(characterId, itemId, quantity, Number(equipped), notes)
      ).insertId
    );
  }
  async update(
    characterId: number,
    instanceId: number,
    quantity: number,
    equipped: boolean,
    notes: string | null
  ) {
    await this.db
      .prepare(
        'UPDATE character_item SET quantity=?,equipped=?,notes=? WHERE character_id=? AND id=?'
      )
      .run(quantity, Number(equipped), notes, characterId, instanceId);
  }
  async remove(characterId: number, instanceId: number) {
    await this.db
      .prepare('DELETE FROM character_item WHERE character_id=? AND id=?')
      .run(characterId, instanceId);
  }
  async saved(
    characterId: number,
    actorId: number,
    action: string,
    instanceId: number,
    details: Record<string, number | boolean>
  ) {
    await this.db
      .prepare('UPDATE character SET updated_at=? WHERE id=?')
      .run(new Date().toISOString(), characterId);
    await this.db
      .prepare(
        'UPDATE dnd_character SET ruleset_revision_id=(SELECT id FROM ruleset_revision ORDER BY id DESC LIMIT 1) WHERE character_id=?'
      )
      .run(characterId);
    await this.db
      .prepare(
        "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,'character_item',?,?)"
      )
      .run(actorId, action, instanceId, JSON.stringify({ characterId, ...details }));
  }
}
