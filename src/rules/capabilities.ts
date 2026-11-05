import type Database from 'better-sqlite3';
import type { ContentItem } from '@freshmag/one-dndb';
import type { User } from '../auth/service.js';
import { CharacterService } from '../characters/service.js';
import { combinedSlots, coreEntryKey, entryBenefits } from './multiclass-progression.js';
import { AppError } from '../errors.js';
import type { Finding } from './validation.js';
export interface Slots {
  level: number;
  maximum: number;
}
export interface SlotResult {
  state: 'known' | 'unknown';
  kind: 'common' | 'pact';
  slots: Slots[] | null;
}
// Read the external progression table; no multiclass rounding or slot table is inferred.
export function catalogSlots(data: ContentItem, level: number): SlotResult {
  const kind = data.casting?.pact ? 'pact' : 'common';
  const unknown: SlotResult = { state: 'unknown', kind, slots: null };
  if (!data.casting || !Number.isInteger(level) || level < 1 || level > 20) return unknown;
  const candidates: Slots[][] = [];
  for (const table of data.progression ?? []) {
    const row = table.rows.find((r) => r[0] === String(level));
    if (!row) continue;
    if (kind === 'pact') {
      const count = table.header.indexOf('Spell Slots'),
        slot = table.header.indexOf('Slot Level');
      if (count < 0 || slot < 0) continue;
      const n = row[count],
        s = row[slot];
      if (!n || !s || !/^\d+$/.test(n) || !/^\d+$/.test(s)) return unknown;
      const maximum = Number(n),
        spellLevel = Number(s);
      if (maximum < 1 || maximum > 20 || spellLevel < 1 || spellLevel > 9) return unknown;
      candidates.push([{ level: spellLevel, maximum }]);
    } else {
      const indices = table.header.flatMap((heading, i) =>
        /^[1-9](st|nd|rd|th)$/.test(heading) ? [{ i, level: Number(heading[0]) }] : []
      );
      if (!indices.length) continue;
      const slots: Slots[] = [];
      for (const column of indices) {
        const cell = row[column.i];
        if (cell === undefined || (!/^\d+$/.test(cell) && cell !== '-')) return unknown;
        const maximum = cell === '-' ? 0 : Number(cell);
        if (maximum < 0 || maximum > 20) return unknown;
        slots.push({ level: column.level, maximum });
      }
      if (new Set(slots.map((s) => s.level)).size !== slots.length) return unknown;
      candidates.push(slots);
    }
  }
  if (
    !candidates.length ||
    candidates.some((s) => JSON.stringify(s) !== JSON.stringify(candidates[0]))
  )
    return unknown;
  return { state: 'known', kind, slots: candidates[0]! };
}
interface ClassRow {
  id: number;
  level: number;
  is_initial_class: number;
  slug: string;
  data: string;
  subclass_data: string | null;
}
export class CapabilityService {
  constructor(private db: Database.Database) {}
  private profile(id: number) {
    if (!this.db.prepare('SELECT 1 FROM dnd_character WHERE character_id=?').get(id))
      throw new AppError(
        409,
        'CAPABILITIES_UNAVAILABLE',
        'Capacidades disponíveis apenas para D&D'
      );
  }
  private classes(id: number) {
    return this.db
      .prepare(
        'SELECT cc.id,cc.level,cc.is_initial_class,e.slug,c.data,s.data AS subclass_data FROM character_class cc JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id LEFT JOIN lib_subclass s ON s.id=cc.subclass_id WHERE cc.character_id=? ORDER BY cc.is_initial_class DESC,cc.id'
      )
      .all(id) as ClassRow[];
  }
  casting(id: number, user?: User) {
    return this.db
      .transaction(() => {
        new CharacterService(this.db).requireReadable(id, user);
        this.profile(id);
        const classes = this.classes(id),
          perClass = classes.map((row) => {
            const base = JSON.parse(row.data) as ContentItem,
              sub = row.subclass_data ? (JSON.parse(row.subclass_data) as ContentItem) : undefined;
            const data = base.casting ? base : sub?.casting ? sub : undefined;
            return {
              characterClassId: row.id,
              class: row.slug,
              classLevel: row.level,
              source: data ? (data === sub ? 'subclass' : 'class') : 'none',
              casting: data?.casting ?? null,
              capacity: data
                ? catalogSlots(data, row.level)
                : base.spellcasting || sub?.spellcasting
                  ? { state: 'unknown' as const, kind: 'common' as const, slots: null }
                  : { state: 'known' as const, kind: 'common' as const, slots: [] as Slots[] },
            };
          });
        const pact = perClass.filter((c) => c.casting?.pact);
        const unresolved = perClass.some((c) => !c.casting && c.capacity.state === 'unknown');
        const commonCapacity = unresolved
          ? {
              state: 'unknown',
              slots: null,
              reason: 'Dados de conjuração insuficientes no catálogo',
            }
          : combinedSlots(
              perClass.map((c) => ({
                id: c.characterClassId,
                slug: c.class,
                level: c.classLevel,
                spellcasting: !!c.casting && !c.casting.pact,
                subclassCasting: c.source === 'subclass',
                individual: c.capacity,
              }))
            );
        return {
          characterId: id,
          perClass,
          common: commonCapacity,
          pact: pact.map((c) => ({ characterClassId: c.characterClassId, ...c.capacity })),
          basis: 'SRD-5.2-and-catalog-progression',
          sources: { multiclassPages: [25, 26], pactSeparate: true },
          rulesVerified: false,
          tracksRemaining: false,
        };
      })
      .deferred();
  }
  benefits(id: number, user?: User) {
    return this.db
      .transaction(() => {
        new CharacterService(this.db).requireReadable(id, user);
        this.profile(id);
        const items = this.classes(id).map((row) => {
          const data = JSON.parse(row.data) as ContentItem;
          return {
            characterClassId: row.id,
            class: row.slug,
            context: row.is_initial_class ? 'initial_class' : 'multiclass_entry',
            coreGrantRuleKey: row.is_initial_class ? null : coreEntryKey(row.id),
            state: row.is_initial_class
              ? 'catalog'
              : entryBenefits(row.slug)
                ? 'verified'
                : 'unknown',
            benefits: row.is_initial_class
              ? {
                  savingThrows: data.savingThrows ?? [],
                  armorTraining: data.armorTraining ?? [],
                  weaponTraining: data.weaponTraining ?? [],
                  toolsFixed: data.toolsFixed ?? [],
                  skillChoices: data.skillChoices ?? [],
                  toolChoices: data.toolChoices ?? [],
                }
              : (entryBenefits(row.slug) ?? null),
            message: row.is_initial_class
              ? 'Benefícios descritos para a classe inicial; liberação por nível deve ser conferida'
              : entryBenefits(row.slug)
                ? 'Benefícios de entrada conferidos no SRD 5.2; características de nível 1 são tratadas separadamente'
                : 'Classe de suplemento sem conferência normativa',
          };
        });
        return { characterId: id, items, rulesVerified: false };
      })
      .deferred();
  }
  audit(id: number): Finding[] {
    const rows = this.db
      .prepare(
        "SELECT t.id,t.ability,t.selection_kind,g.acquisition_context,g.rule_key,cc.id AS class_instance_id,cc.is_initial_class,c.data,e.slug FROM character_saving_throw t JOIN character_rule_grant g ON g.id=t.grant_id AND g.character_id=t.character_id JOIN character_class cc ON cc.id=g.origin_character_class_id JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id WHERE t.character_id=? AND g.origin_kind='class'"
      )
      .all(id) as {
      id: number;
      rule_key: string;
      class_instance_id: number;
      slug: string;
      ability: string;
      selection_kind: string;
      acquisition_context: string;
      is_initial_class: number;
      data: string;
    }[];
    const findings: Finding[] = rows.map((row) => ({
      code: 'CLASS_SAVING_THROW_SOURCE',
      entityId: row.id,
      state:
        row.acquisition_context === 'initial_class' &&
        row.is_initial_class &&
        row.selection_kind === 'fixed'
          ? ((JSON.parse(row.data) as ContentItem).savingThrows ?? []).some(
              (a) => a.toLowerCase() === row.ability
            )
            ? 'pass'
            : 'fail'
          : row.acquisition_context === 'multiclass_entry' &&
              row.rule_key === coreEntryKey(row.class_instance_id) &&
              entryBenefits(row.slug) &&
              row.selection_kind === 'fixed'
            ? 'fail'
            : 'unknown',
      message:
        'Proficiência em salvaguarda versus origem declarada; entrada multiclasse básica não concede salvaguardas',
    }));
    const armor = this.db
      .prepare(
        "SELECT a.id,a.armor_kind,a.selection_kind,g.rule_key,cc.id AS class_instance_id,catalog.slug FROM character_armor_training a JOIN character_rule_grant g ON g.id=a.grant_id AND g.character_id=a.character_id JOIN character_class cc ON cc.id=g.origin_character_class_id JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry catalog ON catalog.id=c.catalog_entry_id WHERE a.character_id=? AND g.origin_kind='class' AND g.acquisition_context='multiclass_entry'"
      )
      .all(id) as {
      id: number;
      rule_key: string;
      class_instance_id: number;
      armor_kind: 'Light' | 'Medium' | 'Heavy' | 'Shield';
      selection_kind: string;
      slug: string;
    }[];
    for (const row of armor) {
      const policy = entryBenefits(row.slug);
      findings.push({
        code: 'MULTICLASS_ARMOR_SOURCE',
        entityId: row.id,
        state:
          policy &&
          row.selection_kind === 'fixed' &&
          row.rule_key === coreEntryKey(row.class_instance_id)
            ? policy.armorTraining.some((a) => a.kind === row.armor_kind)
              ? 'pass'
              : 'fail'
            : 'unknown',
        message: 'Treinamento em armadura versus benefícios de entrada no SRD 5.2',
        evidence: { class: row.slug, armorKind: row.armor_kind },
      });
    }

    const weapons = this.db
      .prepare(
        "SELECT t.id,t.category,t.selection_kind,g.rule_key,cc.id AS class_instance_id,w.category AS item_category,e.slug FROM character_weapon_training t JOIN character_rule_grant g ON g.id=t.grant_id AND g.character_id=t.character_id JOIN character_class cc ON cc.id=g.origin_character_class_id JOIN lib_class c ON c.id=cc.class_id JOIN catalog_entry e ON e.id=c.catalog_entry_id LEFT JOIN lib_weapon_definition w ON w.item_id=t.weapon_item_id WHERE t.character_id=? AND g.origin_kind='class' AND g.acquisition_context='multiclass_entry'"
      )
      .all(id) as {
      id: number;
      rule_key: string;
      class_instance_id: number;
      category: string | null;
      item_category: string | null;
      selection_kind: string;
      slug: string;
    }[];
    for (const row of weapons) {
      const policy = entryBenefits(row.slug);
      findings.push({
        code: 'MULTICLASS_WEAPON_SOURCE',
        entityId: row.id,
        state:
          policy &&
          row.selection_kind === 'fixed' &&
          row.rule_key === coreEntryKey(row.class_instance_id)
            ? policy.weaponTraining.some((w) => w.category === (row.category ?? row.item_category))
              ? 'pass'
              : 'fail'
            : 'unknown',
        message: 'Categoria de arma versus benefícios de entrada no SRD 5.2',
      });
    }
    return findings;
  }
}
