import type Database from 'better-sqlite3';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { AppError } from '../errors.js';
import { InventoryRepository, type InventoryQuery, type ItemRow } from './repository.js';

export interface NewItem {
  itemId: number;
  quantity?: number;
  equipped?: boolean;
  notes?: string | null;
}
export interface ItemChanges {
  quantity?: number;
  equipped?: boolean;
  notes?: string | null;
}
export class InventoryService {
  private repository: InventoryRepository;
  private characters: CharacterService;
  constructor(db: Database.Database) {
    this.repository = new InventoryRepository(db);
    this.characters = new CharacterService(db);
  }
  private profile(characterId: number) {
    if (!this.repository.hasProfile(characterId))
      throw new AppError(
        409,
        'INVENTORY_UNAVAILABLE',
        'Inventário disponível apenas para perfil D&D neste incremento'
      );
  }
  private instance(characterId: number, instanceId: number) {
    const row = this.repository.find(characterId, instanceId);
    if (!row) throw new AppError(404, 'ITEM_NOT_FOUND', 'Instância de item não encontrada');
    return row;
  }
  private present(row: ItemRow) {
    return {
      id: row.id,
      characterId: row.character_id,
      quantity: row.quantity,
      equipped: !!row.equipped,
      notes: row.notes,
      item: {
        id: row.item_id,
        catalogId: row.catalog_id,
        slug: row.slug,
        name: row.name,
        kind: row.kind,
        rarity: row.rarity,
        costCp: row.cost_cp,
        weight: row.weight,
        deprecatedAt: row.deprecated_at,
        sources: this.repository.sources(row.catalog_id),
      },
    };
  }
  list(characterId: number, user: User | undefined, query: InventoryQuery) {
    this.characters.requireReadable(characterId, user);
    this.profile(characterId);
    const { items, total } = this.repository.list(characterId, query);
    return {
      items: items.map((row) => this.present(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  get(characterId: number, instanceId: number, user?: User) {
    this.characters.requireReadable(characterId, user);
    this.profile(characterId);
    return this.present(this.instance(characterId, instanceId));
  }
  create(characterId: number, user: User, input: NewItem) {
    return this.repository.transaction(() => {
      this.characters.requireOwner(characterId, user);
      this.profile(characterId);
      const item = this.repository.item(input.itemId);
      if (!item)
        throw new AppError(
          400,
          'INVALID_ITEM',
          'Item do catálogo inexistente; use o localId de /catalog/item'
        );
      if (item.deprecated_at)
        throw new AppError(400, 'ITEM_DEPRECATED', 'Não é possível adquirir um item depreciado');
      const quantity = input.quantity ?? 1,
        equipped = input.equipped ?? false;
      const instanceId = this.repository.insert(
        characterId,
        item.id,
        quantity,
        equipped,
        input.notes ?? null
      );
      this.repository.saved(characterId, user.id, 'inventory.add', instanceId, {
        itemId: item.id,
        quantity,
        equipped,
      });
      return this.present(this.instance(characterId, instanceId));
    });
  }
  update(characterId: number, instanceId: number, user: User, input: ItemChanges) {
    return this.repository.transaction(() => {
      this.characters.requireOwner(characterId, user);
      this.profile(characterId);
      const current = this.instance(characterId, instanceId),
        quantity = input.quantity ?? current.quantity;
      if (current.deprecated_at && quantity > current.quantity)
        throw new AppError(
          400,
          'ITEM_DEPRECATED',
          'Aumentar a quantidade seria uma nova aquisição de item depreciado'
        );
      const equipped = input.equipped ?? !!current.equipped,
        notes = input.notes === undefined ? current.notes : input.notes;
      this.repository.update(characterId, instanceId, quantity, equipped, notes);
      this.repository.saved(characterId, user.id, 'inventory.update', instanceId, {
        itemId: current.item_id,
        quantity,
        equipped,
      });
      return this.present(this.instance(characterId, instanceId));
    });
  }
  remove(characterId: number, instanceId: number, user: User) {
    this.repository.transaction(() => {
      this.characters.requireOwner(characterId, user);
      this.profile(characterId);
      const current = this.instance(characterId, instanceId);
      this.repository.remove(characterId, instanceId);
      this.repository.saved(characterId, user.id, 'inventory.remove', instanceId, {
        itemId: current.item_id,
        quantity: current.quantity,
      });
    });
  }
}
