import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { AppError } from '../errors.js';
import { content } from '@freshmag/one-dndb/data';

const publicationModule = new URL('../../../frontend/publication.mjs', import.meta.url).href;

interface DocumentRow {
  id: string;
  data: Record<string, unknown>;
  revision: number;
  is_public: boolean;
}
const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', format: 'uuid' } },
};
const missing = () => new AppError(404, 'NOT_FOUND', 'Ficha não encontrada');

export function builderRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const output = (row: DocumentRow) => ({
    id: row.id,
    draft: row.data,
    revision: row.revision,
    isPublic: row.is_public,
  });
  app.get('/builder', async (req) => {
    const user = await auth.authenticate(req.cookies[ACCESS]);
    const rows = (await db
      .prepare(
        'SELECT id,data,revision,is_public FROM builder_document WHERE owner_id=? ORDER BY updated_at DESC'
      )
      .all(user.id)) as DocumentRow[];
    return { documents: rows.map(output) };
  });
  app.get<{ Params: { id: string } }>('/builder/:id', { schema: { params } }, async (req) => {
    const user = await auth.authenticate(req.cookies[ACCESS]);
    const row = (await db
      .prepare('SELECT id,data,revision,is_public FROM builder_document WHERE id=? AND owner_id=?')
      .get(req.params.id, user.id)) as DocumentRow | undefined;
    if (!row) throw missing();
    return output(row);
  });
  app.get<{ Querystring: { page?: number } }>(
    '/builder/public',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { page: { type: 'integer', minimum: 1, maximum: 100000 } },
        },
      },
    },
    async (req, reply) => {
      const page = req.query.page ?? 1;
      const pageSize = 24;
      const rows = await db
        .prepare(
          `SELECT b.id, b.data->>'name' AS name, b.data->'classPlan' AS "classPlan",
                  b.data->>'class' AS class, b.data->'level' AS level
           FROM builder_document b JOIN app_user u ON u.id=b.owner_id
           WHERE b.is_public=TRUE AND u.is_active=1
           ORDER BY b.updated_at DESC, b.id DESC LIMIT ? OFFSET ?`
        )
        .all(pageSize + 1, (page - 1) * pageSize);
      reply.header('Cache-Control', 'no-store');
      return { documents: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
    }
  );
  app.get<{ Params: { id: string } }>(
    '/builder/public/:id',
    { schema: { params } },
    async (req) => {
      const row = (await db
        .prepare(
          'SELECT b.id,b.data,b.revision,b.is_public FROM builder_document b JOIN app_user u ON u.id=b.owner_id WHERE b.id=? AND b.is_public=TRUE AND u.is_active=1'
        )
        .get(req.params.id)) as DocumentRow | undefined;
      if (!row) throw missing();
      const { play: _play, ...draft } = row.data;
      return output({ ...row, data: draft });
    }
  );
  app.put<{
    Params: { id: string };
    Body: { draft: Record<string, unknown>; revision: number; isPublic: boolean };
  }>(
    '/builder/:id',
    {
      bodyLimit: 1024 * 1024,
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['draft', 'revision', 'isPublic'],
          properties: {
            revision: { type: 'integer', minimum: 0, maximum: 2147483646 },
            isPublic: { type: 'boolean' },
            draft: {
              type: 'object',
              additionalProperties: false,
              maxProperties: 40,
              required: ['id', 'name', 'scores', 'selected'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string', maxLength: 100 },
                scores: {
                  type: 'object',
                  required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
                  additionalProperties: false,
                  properties: Object.fromEntries(
                    ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key) => [
                      key,
                      { type: 'integer', minimum: 1, maximum: 30 },
                    ])
                  ),
                },
                selected: {
                  type: 'object',
                  maxProperties: 2000,
                  additionalProperties: {
                    type: 'array',
                    maxItems: 100,
                    uniqueItems: true,
                    items: { type: 'string', maxLength: 500 },
                  },
                },
                species: { type: 'string', maxLength: 150 },
                background: { type: 'string', maxLength: 150 },
                class: { type: 'string', maxLength: 150 },
                classPlan: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 20,
                  items: { type: 'string', maxLength: 150 },
                },
                level: { type: 'integer', minimum: 1, maximum: 20 },
                campaign: { type: 'string', maxLength: 150 },
                method: { type: 'string', enum: ['array', 'points', 'manual'] },
                notes: { type: 'string', maxLength: 10000 },
                saved: { type: 'boolean' },
                updatedAt: { type: 'integer', minimum: 0 },
                featureNotes: {
                  type: 'object',
                  maxProperties: 1000,
                  additionalProperties: { type: 'string', maxLength: 500 },
                },
                abilityBatch: { type: 'object' },
                abilityAssignments: { type: 'object' },
                hp: {
                  type: 'object',
                  maxProperties: 20,
                  additionalProperties: { type: 'integer', minimum: 1, maximum: 12 },
                },
                play: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    damage: { type: 'integer', minimum: 0, maximum: 10000 },
                    temporaryHP: { type: 'integer', minimum: 0, maximum: 10000 },
                    shortRest: { type: 'boolean' },
                    hitDice: {
                      type: 'object',
                      propertyNames: { pattern: '^(6|8|10|12)$' },
                      additionalProperties: { type: 'integer', minimum: 0, maximum: 20 },
                    },
                    slots: {
                      type: 'object',
                      propertyNames: { pattern: '^(spell-[1-9]|pact)$' },
                      additionalProperties: { type: 'integer', minimum: 0, maximum: 20 },
                    },
                    free: {
                      type: 'object',
                      maxProperties: 500,
                      propertyNames: { pattern: '^(short|long):', maxLength: 500 },
                      additionalProperties: { type: 'integer', minimum: 0, maximum: 20 },
                    },
                  },
                },
                inventory: {
                  type: 'array',
                  maxItems: 500,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'itemId', 'quantity'],
                    properties: {
                      id: {
                        type: 'string',
                        maxLength: 500,
                        pattern: '^(?:starter/.+|[a-fA-F0-9-]{36})$',
                      },
                      itemId: { type: 'string', maxLength: 150 },
                      baseItemId: { type: 'string', maxLength: 150 },
                      quantity: { type: 'integer', minimum: 1, maximum: 9999 },
                      equipped: { type: 'boolean' },
                      attuned: { type: 'boolean' },
                      notes: { type: 'string', maxLength: 500 },
                    },
                  },
                },
                removedEquipment: {
                  type: 'array',
                  maxItems: 500,
                  items: { type: 'string', maxLength: 500 },
                },
                narrative: {
                  type: 'object',
                  additionalProperties: { type: 'string', maxLength: 10000 },
                  maxProperties: 6,
                },
                alignment: { type: 'string', maxLength: 150 },
                portrait: { type: 'string', maxLength: 2048 },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const user = await auth.authenticate(req.cookies[ACCESS]);
      const { draft, revision, isPublic } = req.body;
      if (draft.id !== req.params.id)
        throw new AppError(
          400,
          'INVALID_CHARACTER',
          'O identificador da ficha não corresponde ao endereço'
        );
      if (draft.saved) {
        const plan =
          (draft.classPlan as string[] | undefined) ??
          Array.from({ length: Number(draft.level ?? 1) }, () => draft.class);
        const valid = (id: unknown, collection: string) =>
          content.some((entry) => entry.id === id && entry.collection === collection);
        if (
          !String(draft.name).trim() ||
          !valid(draft.species, 'species') ||
          !valid(draft.background, 'backgrounds') ||
          !plan.length ||
          !plan.every((id) => valid(id, 'classes'))
        ) {
          throw new AppError(
            400,
            'INVALID_CHARACTER',
            'Uma ficha concluída precisa de nome, espécie, antecedente e classes válidos'
          );
        }
      }
      if (isPublic && (!draft.saved || !String(draft.name).trim()))
        throw new AppError(
          409,
          'PUBLICATION_DENIED',
          'Salve a ficha antes de publicar'
        );
      if (isPublic) {
        const { validatePublication } = (await import(publicationModule)) as {
          validatePublication(draft: Record<string, unknown>): {
            issues: [string, string][];
            selected: Record<string, string[]>;
          };
        };
        const { issues, selected } = validatePublication(draft);
        if (issues.length)
          throw new AppError(409, 'PUBLICATION_DENIED', `Revise a ficha. ${issues[0]![1]}`);
        draft.selected = selected;
      }
      return db
        .transaction(async () => {
          const existing = await db
            .prepare('SELECT owner_id,revision FROM builder_document WHERE id=?')
            .get(req.params.id);
          if (existing && existing.owner_id !== user.id) throw missing();
          if ((existing?.revision ?? 0) !== revision)
            throw new AppError(
              409,
              'REVISION_CONFLICT',
              'A ficha foi alterada em outra aba ou dispositivo'
            );
          const row = existing
            ? await db
                .prepare(
                  'UPDATE builder_document SET data=?::jsonb,revision=revision+1,is_public=?,updated_at=clock_timestamp() WHERE id=? AND owner_id=? RETURNING id,data,revision,is_public'
                )
                .get(JSON.stringify(draft), isPublic, req.params.id, user.id)
            : await db
                .prepare(
                  'INSERT INTO builder_document(id,owner_id,data,is_public) VALUES(?,?,?::jsonb,?) RETURNING id,data,revision,is_public'
                )
                .get(req.params.id, user.id, JSON.stringify(draft), isPublic);
          await db
            .prepare(
              'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)'
            )
            .run(user.id, 'builder.save', 'app_user', user.id);
          return output(row as DocumentRow);
        })
        .immediate();
    }
  );
  app.delete<{ Params: { id: string }; Querystring: { revision: number } }>(
    '/builder/:id',
    {
      schema: {
        params,
        querystring: {
          type: 'object',
          required: ['revision'],
          additionalProperties: false,
          properties: { revision: { type: 'integer', minimum: 1 } },
        },
      },
    },
    async (req, reply) => {
      const user = await auth.authenticate(req.cookies[ACCESS]);
      await db
        .transaction(async () => {
          const row = await db
            .prepare('SELECT owner_id,revision FROM builder_document WHERE id=?')
            .get(req.params.id);
          if (!row || row.owner_id !== user.id) throw missing();
          if (row.revision !== req.query.revision)
            throw new AppError(
              409,
              'REVISION_CONFLICT',
              'A ficha foi alterada. Atualize a lista antes de excluir'
            );
          await db
            .prepare('DELETE FROM builder_document WHERE id=? AND owner_id=?')
            .run(req.params.id, user.id);
          await db
            .prepare(
              'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)'
            )
            .run(user.id, 'builder.delete', 'app_user', user.id);
        })
        .immediate();
      return reply.code(204).send();
    }
  );
}
