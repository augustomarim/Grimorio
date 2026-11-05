import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import type { NestedOrigin } from './nested.js';
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
export function spellRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const service = new SpellService(db);
  app.post<{
    Params: {
      id: number;
      instanceId: number;
    };
    Body: NestedOrigin;
  }>(
    '/characters/:id/spells/:instanceId/nested-origin',
    {
      schema: {
        params: instanceParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['choiceInstanceId', 'nestedChoiceKey'],
          properties: {
            choiceInstanceId: id,
            nestedChoiceKey: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
          },
        },
      },
    },
    async (req) =>
      await service.bindChoice(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        req.params.instanceId,
        req.body
      )
  );
  for (const book of [false, true]) {
    const path = book ? '/characters/:id/spellbook' : '/characters/:id/spells';
    app.get<{
      Params: {
        id: number;
      };
      Querystring: {
        page: number;
        limit: number;
      };
    }>(
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
      async (req) =>
        await service.list(
          req.params.id,
          req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined,
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
            choiceInstanceId: id,
            nestedChoiceKey: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
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
    app.post<{
      Params: {
        id: number;
      };
      Body: SpellInput & BookInput;
    }>(path, { schema: { params, body } }, async (req, reply) => {
      const user = await auth.authenticate(req.cookies[ACCESS]);
      return await reply
        .code(201)
        .send(
          book
            ? await service.addBook(req.params.id, user, req.body)
            : await service.add(req.params.id, user, req.body)
        );
    });
    app.patch<{
      Params: {
        id: number;
        instanceId: number;
      };
      Body: SpellChanges;
    }>(
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
      async (req) =>
        await service.update(
          req.params.id,
          await auth.authenticate(req.cookies[ACCESS]),
          req.params.instanceId,
          book,
          req.body
        )
    );
    app.delete<{
      Params: {
        id: number;
        instanceId: number;
      };
    }>(`${path}/:instanceId`, { schema: { params: instanceParams } }, async (req, reply) => {
      await service.remove(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        req.params.instanceId,
        book
      );
      return await reply.code(204).send();
    });
  }
}
