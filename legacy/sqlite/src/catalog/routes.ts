import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { AppError } from '../errors.js';
export const KINDS = [
  'species',
  'class',
  'subclass',
  'background',
  'fighting_style',
  'spell',
  'feat',
  'item',
  'tool_group',
  'tool',
  'language',
  'alignment',
  'rule',
  'skill',
  'weapon_property',
  'weapon_mastery',
] as const;
export type Kind = (typeof KINDS)[number];
export function sources(db: Database.Database, id: number) {
  return db
    .prepare(
      'SELECT s.id,s.slug,s.name,s.source_type AS type,s.edition FROM catalog_entry_source es JOIN rules_source s ON s.id=es.source_id WHERE es.catalog_entry_id=? ORDER BY s.name'
    )
    .all(id);
}
export function catalogRoutes(app: FastifyInstance, db: Database.Database) {
  const pagination = {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  };
  app.get('/systems', () => ({
    items: db
      .prepare('SELECT id,code,name,edition FROM rpg_system WHERE is_enabled=1 ORDER BY name')
      .all(),
  }));
  app.get<{ Querystring: { page: number; limit: number } }>(
    '/sources',
    { schema: { querystring: pagination } },
    (req) => ({
      items: db
        .prepare(
          'SELECT id,slug,name,source_type AS type,edition FROM rules_source ORDER BY name LIMIT ? OFFSET ?'
        )
        .all(req.query.limit, (req.query.page - 1) * req.query.limit),
    })
  );
  app.get<{
    Params: { kind: Kind };
    Querystring: { page: number; limit: number; q?: string; includeDeprecated: boolean };
  }>(
    '/catalog/:kind',
    {
      schema: {
        params: {
          type: 'object',
          properties: { kind: { type: 'string', enum: KINDS } },
          required: ['kind'],
        },
        querystring: {
          ...pagination,
          properties: {
            ...pagination.properties,
            q: { type: 'string', maxLength: 100 },
            includeDeprecated: { type: 'boolean', default: false },
          },
        },
      },
    },
    (req) => {
      const { kind } = req.params,
        { page, limit, q, includeDeprecated } = req.query;
      const where =
        "kind=? AND (? OR deprecated_at IS NULL) AND (? IS NULL OR name LIKE ? ESCAPE '\\')";
      const term = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
      const args = [kind, Number(includeDeprecated), term, term];
      const items = db
        .prepare(
          `SELECT id,kind,slug,name,deprecated_at AS deprecatedAt FROM catalog_entry WHERE ${where} ORDER BY name,id LIMIT ? OFFSET ?`
        )
        .all(...args, limit, (page - 1) * limit) as { id: number }[];
      return {
        items: items.map((item) => ({
          ...item,
          localId: (
            db.prepare(`SELECT id FROM lib_${kind} WHERE catalog_entry_id=?`).get(item.id) as
              { id: number } | undefined
          )?.id,
          sources: sources(db, item.id),
        })),
        page,
        limit,
        total: (
          db.prepare(`SELECT count(*) AS count FROM catalog_entry WHERE ${where}`).get(...args) as {
            count: number;
          }
        ).count,
      };
    }
  );
  app.get<{ Params: { kind: Kind; id: number } }>(
    '/catalog/:kind/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: KINDS },
            id: { type: 'integer', minimum: 1 },
          },
          required: ['kind', 'id'],
        },
      },
    },
    (req) => {
      const entry = db
        .prepare(
          'SELECT id,kind,slug,name,deprecated_at AS deprecatedAt FROM catalog_entry WHERE id=? AND kind=?'
        )
        .get(req.params.id, req.params.kind) as { id: number } | undefined;
      if (!entry) throw new AppError(404, 'NOT_FOUND', 'Opção não encontrada');
      const detail = db
        .prepare(`SELECT * FROM lib_${req.params.kind} WHERE catalog_entry_id=?`)
        .get(entry.id) as Record<string, unknown> | undefined;
      if (!detail) throw new AppError(503, 'CATALOG_INCOMPLETE', 'Catálogo incompleto');
      return {
        ...entry,
        sources: sources(db, entry.id),
        details: {
          ...detail,
          ...(typeof detail.data === 'string' ? { data: JSON.parse(detail.data) } : {}),
        },
      };
    }
  );
}
