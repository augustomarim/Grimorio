import type { Dexie } from 'dexie';
import { load, resetSharedDb } from '@freshmag/one-dndb';
import { EXPECTED_LIBRARY_VERSION, EXPECTED_REVISION } from './version.js';
import { REVISION, links } from '@freshmag/one-dndb/data';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import { digest } from '../auth/crypto.js';
import { KINDS, type Kind } from './routes.js';
type Raw = Record<string, unknown> & {
  id: string;
  name: string;
};
const raw = (x: unknown) => x as Raw;
const bool = (x: unknown) => Number(!!x);
export interface ImportProgress {
  stage: string;
  completed?: number;
  total?: number;
}
export async function importCatalog(
  database: Database,
  progress: (event: ImportProgress) => void = () => {}
) {
  progress({ stage: 'Lendo pacote local de regras' });
  const version = (
    createRequire(import.meta.url)('@freshmag/one-dndb/package.json') as {
      version: string;
    }
  ).version;
  if (version !== EXPECTED_LIBRARY_VERSION || REVISION !== EXPECTED_REVISION)
    throw new Error('Importador validado somente para one-dndb 0.5.1');
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
    const result = await database
      .transaction(async () => {
        await database
          .prepare(
            "INSERT INTO rpg_system(code,name,edition,is_enabled) VALUES('dnd-2024','Dungeons & Dragons','2024',1) ON CONFLICT(code) DO NOTHING"
          )
          .run();
        await database
          .prepare(
            "INSERT INTO ruleset_revision(revision,library_version) VALUES(?,'0.5.1') ON CONFLICT(revision) DO NOTHING"
          )
          .run(REVISION);

        const localIds = new Map<string, number>();
        const pending = new Map<Kind, { x: Raw; record: Record<string, unknown> }[]>();
        const books = new Map<string, number>();
        for (const row of await database
          .prepare('SELECT id,name FROM rules_source ORDER BY id')
          .all())
          if (!books.has(row.name)) books.set(row.name, row.id);
        const tuples = (rows: number, columns: number) =>
          Array.from({ length: rows }, () => `(${Array(columns).fill('?').join(',')})`).join(',');
        function upsert(kind: Kind, x: Raw, extra: Record<string, unknown> = {}, json = true) {
          const records = pending.get(kind) ?? [];
          records.push({ x, record: { ...extra, ...(json ? { data: JSON.stringify(x) } : {}) } });
          pending.set(kind, records);
          counts[kind] = (counts[kind] ?? 0) + 1;
        }
        async function flush() {
          for (const [kind, records] of pending) {
            progress({ stage: `Carregando ${kind}`, completed: 0, total: records.length });
            for (let start = 0; start < records.length; start += 100) {
              const batch = records.slice(start, start + 100);
              const entries = await database
                .prepare(
                  `INSERT INTO catalog_entry(kind,slug,name) VALUES ${tuples(batch.length, 3)} ON CONFLICT(kind,slug) DO UPDATE SET name=excluded.name,deprecated_at=NULL RETURNING id,slug`
                )
                .all(...batch.flatMap(({ x }) => [kind, x.id, x.name]));
              const entryIds = new Map<string, number>(entries.map((r) => [r.slug, r.id]));
              for (const r of entries) seen.add(r.id);
              const columns = [
                ...Object.keys(batch[0]!.record),
                'catalog_entry_id',
                'catalog_kind',
              ];
              const details = await database
                .prepare(
                  `INSERT INTO lib_${kind}(${columns.join(',')}) VALUES ${tuples(batch.length, columns.length)} ON CONFLICT(catalog_entry_id) DO UPDATE SET ${columns
                    .filter((c) => c !== 'catalog_entry_id')
                    .map((c) => `${c}=excluded.${c}`)
                    .join(',')} RETURNING id,catalog_entry_id`
                )
                .all(
                  ...batch.flatMap(({ x, record }) => [
                    ...Object.values(record),
                    entryIds.get(x.id),
                    kind,
                  ])
                );
              const detailIds = new Map<number, number>(
                details.map((r) => [r.catalog_entry_id, r.id])
              );
              for (const { x } of batch)
                localIds.set(`${kind}:${x.id}`, detailIds.get(entryIds.get(x.id)!)!);
              const names = [
                ...new Set(
                  batch
                    .map(({ x }) => x.source)
                    .filter((v): v is string => typeof v === 'string' && !v.includes(','))
                ),
              ];
              const missing = names.filter((name) => !books.has(name));
              if (missing.length) {
                const rows = await database
                  .prepare(
                    `INSERT INTO rules_source(slug,name,source_type,edition) VALUES ${tuples(missing.length, 4)} ON CONFLICT(slug) DO UPDATE SET slug=excluded.slug RETURNING id,slug`
                  )
                  .all(
                    ...missing.flatMap((name) => [
                      `book-${digest(name).slice(0, 24)}`,
                      name,
                      name === "Player's Handbook" ? 'base' : 'supplement',
                      'D&D 2024',
                    ])
                  );
                const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
                for (const name of missing)
                  books.set(name, bySlug.get(`book-${digest(name).slice(0, 24)}`)!);
              }
              const references = batch.filter(
                ({ x }) => typeof x.source === 'string' && !x.source.includes(',')
              );
              if (references.length)
                await database
                  .prepare(
                    `INSERT INTO catalog_entry_source(catalog_entry_id,source_id) VALUES ${tuples(references.length, 2)} ON CONFLICT DO NOTHING`
                  )
                  .run(
                    ...references.flatMap(({ x }) => [
                      entryIds.get(x.id),
                      books.get(x.source as string),
                    ])
                  );
              progress({
                stage: `Carregando ${kind}`,
                completed: Math.min(start + batch.length, records.length),
                total: records.length,
              });
            }
          }
          pending.clear();
        }
        const idFor = (kind: Kind, slug: string) => {
          const id = localIds.get(`${kind}:${slug}`);
          if (id === undefined) throw new Error(`Referência ausente: ${kind}`);
          return id;
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
        await flush();
        for (const x0 of data.collections.subclasses ?? []) {
          const x = raw(x0),
            parents = (data.collections.classes ?? [])
              .filter((c) => c.name === x.class)
              .map((c) => ({ id: idFor('class', c.id) }));
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
        await flush();
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

        await flush();
        progress({ stage: 'Carregando definições de armas' });
        const weapons = data.items.filter((x) => x.weapon);
        if (weapons.length) {
          await database
            .prepare(
              `INSERT INTO lib_weapon_definition(item_id,category,weapon_range,mastery_id) VALUES ${tuples(weapons.length, 4)} ON CONFLICT(item_id) DO UPDATE SET category=excluded.category,weapon_range=excluded.weapon_range,mastery_id=excluded.mastery_id`
            )
            .run(
              ...weapons.flatMap((x) => [
                idFor('item', x.id),
                x.weapon!.category,
                x.weapon!.range,
                x.weapon!.mastery ? idFor('weapon_mastery', x.weapon!.mastery) : null,
              ])
            );
          await database
            .prepare(
              `DELETE FROM lib_weapon_property_link WHERE item_id IN (${weapons.map(() => '?').join(',')})`
            )
            .run(...weapons.map((x) => idFor('item', x.id)));
          const properties = weapons.flatMap((x) =>
            x.weapon!.properties.map((p) => [idFor('item', x.id), idFor('weapon_property', p)])
          );
          for (let i = 0; i < properties.length; i += 200) {
            const batch = properties.slice(i, i + 200);
            await database
              .prepare(
                `INSERT INTO lib_weapon_property_link(item_id,property_id) VALUES ${tuples(batch.length, 2)}`
              )
              .run(...batch.flat());
          }
        }
        if (seen.size !== 1905 || KINDS.some((k) => !counts[k]))
          throw new Error('Contagens do catálogo não correspondem à versão validada');

        progress({ stage: 'Conciliando registros depreciados' });
        const deprecated = (
          await database
            .prepare(
              `UPDATE catalog_entry SET deprecated_at=COALESCE(deprecated_at,?) WHERE id NOT IN (${[...seen].map(() => '?').join(',')}) AND deprecated_at IS NULL`
            )
            .run(new Date().toISOString(), ...seen)
        ).changes;
        await database.prepare('DELETE FROM lib_link').run();
        for (let start = 0; start < links.length; start += 250) {
          const batch = links.slice(start, start + 250);
          await database
            .prepare(
              `INSERT INTO lib_link(link_key,from_type,from_slug,kind,to_type,to_slug) VALUES ${tuples(batch.length, 6)}`
            )
            .run(
              ...batch.flatMap((link) => [
                link.key,
                link.fromType,
                link.from,
                link.kind,
                link.toType,
                link.to,
              ])
            );
          progress({
            stage: 'Carregando referências',
            completed: Math.min(start + batch.length, links.length),
            total: links.length,
          });
        }
        progress({ stage: 'Validando integridade antes de confirmar' });
        const missing = await database
          .prepare(
            KINDS.map(
              (kind) =>
                `SELECT '${kind}' AS kind FROM catalog_entry e LEFT JOIN lib_${kind} t ON t.catalog_entry_id=e.id WHERE e.kind='${kind}' AND t.id IS NULL`
            ).join(' UNION ALL ')
          )
          .get();
        if (missing) throw new Error('Identidade sem detalhe');
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
    progress({ stage: 'Importação confirmada', completed: result.total, total: result.total });
    return result;
  } finally {
    // Método herdado confirmado em Dexie; os tipos 0.5.1 perdem essa herança sob NodeNext.
    (db as unknown as Pick<Dexie, 'close'>).close();
    resetSharedDb();
  }
}
