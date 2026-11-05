import type { Dexie } from 'dexie';
import { load, resetSharedDb } from '@freshmag/one-dndb';
import { REVISION, links } from '@freshmag/one-dndb/data';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { digest } from '../auth/crypto.js';
import { KINDS, type Kind } from './routes.js';

type Raw = Record<string, unknown> & { id: string; name: string };
const raw = (x: unknown) => x as Raw;
const bool = (x: unknown) => Number(!!x);
export async function importCatalog(sqlite: Database.Database) {
  const version = (
    createRequire(import.meta.url)('@freshmag/one-dndb/package.json') as { version: string }
  ).version;
  if (version !== '0.5.1') throw new Error('Importador validado somente para one-dndb 0.5.1');
  const { db, data } = await load({
    name: `grimorio-import-${randomUUID()}`,
    indexedDB,
    IDBKeyRange,
  });
  try {
    if (data.content.length !== 198 || data.spells.length !== 444 || data.items.length !== 799)
      throw new Error('Catálogo 0.5.1 incompleto; importação cancelada');
    const seen = new Set<number>(),
      counts: Partial<Record<Kind, number>> = {};
    const result = sqlite
      .transaction(() => {
        sqlite
          .prepare(
            "INSERT INTO rpg_system(code,name,edition,is_enabled) VALUES('dnd-2024','Dungeons & Dragons','2024',1) ON CONFLICT(code) DO NOTHING"
          )
          .run();
        sqlite
          .prepare(
            "INSERT INTO ruleset_revision(revision,library_version) VALUES(?,'0.5.1') ON CONFLICT(revision) DO NOTHING"
          )
          .run(REVISION);
        function upsert(kind: Kind, x: Raw, extra: Record<string, unknown> = {}, json = true) {
          sqlite
            .prepare(
              'INSERT INTO catalog_entry(kind,slug,name) VALUES(?,?,?) ON CONFLICT(kind,slug) DO UPDATE SET name=excluded.name,deprecated_at=NULL'
            )
            .run(kind, x.id, x.name);
          const entry = (
            sqlite
              .prepare('SELECT id FROM catalog_entry WHERE kind=? AND slug=?')
              .get(kind, x.id) as { id: number }
          ).id;
          seen.add(entry);
          counts[kind] = (counts[kind] ?? 0) + 1;
          const record = {
              ...extra,
              ...(json ? { data: JSON.stringify(x) } : {}),
              catalog_entry_id: entry,
              catalog_kind: kind,
            },
            cols = Object.keys(record);
          sqlite
            .prepare(
              `INSERT INTO lib_${kind}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')}) ON CONFLICT(catalog_entry_id) DO UPDATE SET ${cols
                .filter((c) => c !== 'catalog_entry_id')
                .map((c) => `${c}=excluded.${c}`)
                .join(',')}`
            )
            .run(...Object.values(record));
          const id = (
            sqlite.prepare(`SELECT id FROM lib_${kind} WHERE catalog_entry_id=?`).get(entry) as {
              id: number;
            }
          ).id;
          if (typeof x.source === 'string' && !x.source.includes(',')) {
            const slug = `book-${digest(x.source).slice(0, 24)}`;
            // Preservar um cadastro bibliográfico já conciliado pelo nome.
            let book = sqlite
              .prepare('SELECT id FROM rules_source WHERE name=? ORDER BY id LIMIT 1')
              .get(x.source) as { id: number } | undefined;
            if (!book) {
              sqlite
                .prepare(
                  "INSERT INTO rules_source(slug,name,source_type,edition) VALUES(?,?,?,'D&D 2024') ON CONFLICT(slug) DO NOTHING"
                )
                .run(slug, x.source, x.source === "Player's Handbook" ? 'base' : 'supplement');
              book = sqlite.prepare('SELECT id FROM rules_source WHERE slug=?').get(slug) as {
                id: number;
              };
            }
            sqlite
              .prepare(
                'INSERT INTO catalog_entry_source(catalog_entry_id,source_id) VALUES(?,?) ON CONFLICT DO NOTHING'
              )
              .run(entry, book.id);
          }
          return id;
        }
        const idFor = (kind: Kind, slug: string) => {
          const row = sqlite
            .prepare(
              `SELECT t.id FROM lib_${kind} t JOIN catalog_entry e ON e.id=t.catalog_entry_id WHERE e.slug=? AND e.kind=?`
            )
            .get(slug, kind) as { id: number } | undefined;
          if (!row) throw new Error(`Referência ausente: ${kind}`);
          return row.id;
        };
        for (const x0 of data.collections.species ?? []) {
          const x = raw(x0);
          upsert('species', x, {
            setting: x.setting ?? null,
            creature_type: x.creatureType ?? null,
            speed: x.speed ?? null,
          });
        }
        for (const x0 of data.collections.classes ?? []) {
          const x = raw(x0);
          if (typeof x.hitDie !== 'string' || !/^D(6|8|10|12)$/.test(x.hitDie))
            throw new Error('Dado de classe inválido');
          upsert('class', x, {
            hit_die: Number(x.hitDie.slice(1)),
            is_spellcaster: bool(x.spellcasting),
            subclass_level: x.subclassLevel,
          });
        }
        for (const x0 of data.collections.subclasses ?? []) {
          const x = raw(x0),
            parents = sqlite
              .prepare(
                "SELECT c.id FROM lib_class c JOIN catalog_entry e ON e.id=c.catalog_entry_id WHERE e.name=? AND e.kind='class' AND e.deprecated_at IS NULL"
              )
              .all(x.class) as { id: number }[];
          if (parents.length !== 1) throw new Error('Classe de subclasse ambígua');
          upsert('subclass', x, { class_id: parents[0]!.id });
        }
        for (const x of data.collections.backgrounds ?? [])
          upsert('background', raw(x), { setting: x.setting ?? null });
        for (const x of data.collections['fighting-styles'] ?? []) upsert('fighting_style', raw(x));
        for (const x of data.spells)
          upsert('spell', raw(x), {
            level: x.level,
            school: x.school,
            is_concentration: bool(x.concentration),
            is_ritual: bool(x.ritual),
          });
        for (const x of data.feats)
          upsert('feat', raw(x), {
            category: x.category ?? null,
            setting: x.setting ?? null,
            is_repeatable: bool(x.repeatable),
          });
        for (const x of data.items)
          upsert('item', raw(x), {
            kind: x.kind,
            rarity: x.rarity ?? null,
            is_magic: bool(x.magic),
            cost_cp: x.cost,
            weight: x.weight ?? null,
          });
        for (const x of data.toolGroups) upsert('tool_group', raw(x), {}, false);
        for (const x of data.tools)
          upsert('tool', raw(x), { group_id: idFor('tool_group', x.group) });
        for (const x of data.languages)
          upsert(
            'language',
            raw(x),
            { tier: x.tier, origin: x.origin, is_always: bool(x.always), note: x.note ?? null },
            false
          );
        for (const x of data.alignments)
          upsert(
            'alignment',
            raw(x),
            { abbr: x.abbr, order_axis: x.order, morality_axis: x.morality, body: x.body ?? null },
            false
          );
        for (const x of data.rules) upsert('rule', raw(x), { category: x.category });
        for (const x of Object.values(data.glossary))
          if (x.id.startsWith('skill-')) {
            const ability = x.kind?.split(' ')[0]?.toLowerCase();
            if (!ability) throw new Error('Perícia sem atributo');
            upsert('skill', raw(x), { ability });
          }
        for (const x of data.weaponProperties) upsert('weapon_property', raw(x));
        for (const x of data.weaponMasteries) upsert('weapon_mastery', raw(x));
        for (const x of data.items)
          if (x.weapon) {
            const item = idFor('item', x.id);
            sqlite
              .prepare(
                'INSERT INTO lib_weapon_definition(item_id,category,weapon_range,mastery_id) VALUES(?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET category=excluded.category,weapon_range=excluded.weapon_range,mastery_id=excluded.mastery_id'
              )
              .run(
                item,
                x.weapon.category,
                x.weapon.range,
                x.weapon.mastery ? idFor('weapon_mastery', x.weapon.mastery) : null
              );
            sqlite.prepare('DELETE FROM lib_weapon_property_link WHERE item_id=?').run(item);
            for (const prop of x.weapon.properties)
              sqlite
                .prepare('INSERT INTO lib_weapon_property_link(item_id,property_id) VALUES(?,?)')
                .run(item, idFor('weapon_property', prop));
          }
        if (seen.size !== 1905 || KINDS.some((k) => !counts[k]))
          throw new Error('Contagens do catálogo não correspondem à versão validada');
        const old = sqlite.prepare('SELECT id FROM catalog_entry').all() as { id: number }[];
        let deprecated = 0;
        for (const entry of old)
          if (!seen.has(entry.id)) {
            deprecated += sqlite
              .prepare(
                'UPDATE catalog_entry SET deprecated_at=COALESCE(deprecated_at,?) WHERE id=? AND deprecated_at IS NULL'
              )
              .run(new Date().toISOString(), entry.id).changes;
          }
        sqlite.prepare('DELETE FROM lib_link').run();
        const edge = sqlite.prepare(
          'INSERT INTO lib_link(link_key,from_type,from_slug,kind,to_type,to_slug) VALUES(?,?,?,?,?,?)'
        );
        for (const link of links)
          edge.run(link.key, link.fromType, link.from, link.kind, link.toType, link.to);
        for (const kind of KINDS)
          if (
            sqlite
              .prepare(
                `SELECT 1 FROM catalog_entry e LEFT JOIN lib_${kind} t ON t.catalog_entry_id=e.id WHERE e.kind=? AND t.id IS NULL`
              )
              .get(kind)
          )
            throw new Error('Identidade sem detalhe');
        if ((sqlite.pragma('foreign_key_check') as unknown[]).length)
          throw new Error('Catálogo violou referências');
        return {
          revision: REVISION,
          version,
          total: seen.size,
          counts,
          links: links.length,
          deprecated,
        };
      })
      .immediate();
    return result;
  } finally {
    // Método herdado confirmado em Dexie; os tipos 0.5.1 perdem essa herança sob NodeNext.
    (db as unknown as Pick<Dexie, 'close'>).close();
    resetSharedDb();
  }
}
