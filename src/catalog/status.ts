import {
  EXPECTED_REVISION,
  EXPECTED_LIBRARY_VERSION,
  EXPECTED_ENTRY_COUNT,
  EXPECTED_LINK_COUNT,
} from './version.js';
import type { Database } from '../db/database.js';
import { KINDS } from './routes.js';
export async function catalogStatus(db: Database) {
  const summary = await db
    .prepare(
      'SELECT count(*) total,count(*) FILTER(WHERE deprecated_at IS NULL) active,count(DISTINCT kind) kinds FROM catalog_entry'
    )
    .get();
  const revision = await db
    .prepare('SELECT 1 FROM ruleset_revision WHERE revision=? AND library_version=?')
    .get(EXPECTED_REVISION, EXPECTED_LIBRARY_VERSION);
  const system = await db
    .prepare("SELECT 1 FROM rpg_system WHERE code='dnd-2024' AND is_enabled=1")
    .get();
  const links = (await db.prepare('SELECT count(*) total FROM lib_link').get()).total;
  const missing = await db
    .prepare(
      KINDS.map(
        (kind) =>
          `SELECT '${kind}' AS kind FROM catalog_entry e LEFT JOIN lib_${kind} l ON l.catalog_entry_id=e.id WHERE e.kind='${kind}' AND e.deprecated_at IS NULL AND l.id IS NULL`
      ).join(' UNION ALL ')
    )
    .get();
  return {
    total: summary.total as number,
    ready:
      summary.active >= EXPECTED_ENTRY_COUNT &&
      summary.kinds === KINDS.length &&
      !!revision &&
      !!system &&
      links >= EXPECTED_LINK_COUNT &&
      !missing,
  };
}
