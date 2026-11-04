import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { SpellService, type SpellInput, type BookInput, type SpellChanges } from './service.js';
const id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const notes = { type: ['string', 'null'], maxLength: 10000 };
const castingAbilityChoice = {
  type: ['string', 'null'],
  enum: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', null],
};
const isPrepared = { type: 'boolean' };
const params = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id },
};
const instanceParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'instanceId'],
  properties: { id, instanceId: id },
};
export function spellRoutes(app: FastifyInstance, db: Database.Database, auth: AuthService) {
  const service = new SpellService(db);
  for (const book of [false, true]) {
    const path = book ? '/characters/:id/spellbook' : '/characters/:id/spells';
    app.get<{ Params: { id: number }; Querystring: { page: number; limit: number } }>(
      path,
      {
        schema: {
          params,
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
              limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          },
        },
      },
      (req) =>
        service.list(
          req.params.id,
          req.cookies[ACCESS] ? auth.authenticate(req.cookies[ACCESS]) : undefined,
          book,
          req.query.page,
          req.query.limit
        )
    );
    const body = book
      ? {
          type: 'object',
          additionalProperties: false,
          required: ['spellId', 'characterClassId'],
          properties: { spellId: id, characterClassId: id, notes },
        }
      : {
          type: 'object',
          additionalProperties: false,
          required: ['spellId', 'originKind', 'originId', 'preparationMode'],
          properties: {
            spellId: id,
            originKind: {
              type: 'string',
              enum: ['class', 'subclass', 'species', 'background', 'feat'],
            },
            originId: id,
            preparationMode: {
              type: 'string',
              enum: ['cantrip', 'selectable', 'always_prepared', 'granted'],
            },
            isPrepared,
            castingAbilityChoice,
            notes,
          },
        };
    app.post<{ Params: { id: number }; Body: SpellInput & BookInput }>(
      path,
      { schema: { params, body } },
      (req, reply) => {
        const user = auth.authenticate(req.cookies[ACCESS]);
        return reply
          .code(201)
          .send(
            book
              ? service.addBook(req.params.id, user, req.body)
              : service.add(req.params.id, user, req.body)
          );
      }
    );
    app.patch<{ Params: { id: number; instanceId: number }; Body: SpellChanges }>(
      `${path}/:instanceId`,
      {
        schema: {
          params: instanceParams,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: book ? { notes } : { notes, isPrepared, castingAbilityChoice },
          },
        },
      },
      (req) =>
        service.update(
          req.params.id,
          auth.authenticate(req.cookies[ACCESS]),
          req.params.instanceId,
          book,
          req.body
        )
    );
    app.delete<{ Params: { id: number; instanceId: number } }>(
      `${path}/:instanceId`,
      { schema: { params: instanceParams } },
      (req, reply) => {
        service.remove(
          req.params.id,
          auth.authenticate(req.cookies[ACCESS]),
          req.params.instanceId,
          book
        );
        return reply.code(204).send();
      }
    );
  }
}
