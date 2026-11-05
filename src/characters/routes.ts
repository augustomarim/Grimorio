import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import type { AuthService } from '../auth/service.js';
import { AppError } from '../errors.js';
import { ACCESS } from '../routes/auth.js';
import { CharacterService, type CharacterInput } from './service.js';
const id = { type: 'integer', minimum: 1 };
const nullableId = { anyOf: [id, { type: 'null' }] };
const attribute = { type: 'integer', minimum: 1, maximum: 30 };
const properties = {
  name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
  systemCode: { type: 'string', const: 'dnd-2024' },
  portrait: { type: ['string', 'null'], maxLength: 2048 },
  campaignSetting: {
    anyOf: [{ type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' }, { type: 'null' }],
  },
  attributes: {
    type: 'object',
    additionalProperties: false,
    required: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    properties: {
      strength: attribute,
      dexterity: attribute,
      constitution: attribute,
      intelligence: attribute,
      wisdom: attribute,
      charisma: attribute,
    },
  },
  speciesId: id,
  backgroundId: nullableId,
  alignmentId: nullableId,
  classes: {
    type: 'array',
    minItems: 1,
    maxItems: 13,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['classId', 'level', 'initial'],
      properties: {
        classId: id,
        level: { type: 'integer', minimum: 1, maximum: 20 },
        subclassId: nullableId,
        initial: { type: 'boolean' },
      },
    },
  },
  progression: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['classId', 'hpMethod'],
      properties: {
        classId: id,
        hpMethod: { type: 'string', enum: ['first_max', 'average', 'roll'] },
        hpRoll: { anyOf: [{ type: 'integer', minimum: 1, maximum: 12 }, { type: 'null' }] },
      },
    },
  },
  narrative: {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      ['backstory', 'description', 'personality', 'motivations', 'goals'].map((k) => [
        k,
        { type: ['string', 'null'], maxLength: 10000 },
      ])
    ),
  },
};
export function characterRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const service = new CharacterService(db),
    params = { type: 'object', properties: { id }, required: ['id'] };
  const query = {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      q: { type: 'string', maxLength: 100 },
    },
  };
  for (const [path, publicOnly] of [
    ['public', true],
    ['mine', false],
  ] as const)
    app.get<{
      Querystring: {
        page: number;
        limit: number;
        q?: string;
      };
    }>(
      `/characters/${path}`,
      { schema: { querystring: query } },
      async (req) =>
        await service.list(
          publicOnly ? undefined : await auth.authenticate(req.cookies[ACCESS]),
          req.query.page,
          req.query.limit,
          publicOnly,
          req.query.q
        )
    );
  app.post<{
    Body: CharacterInput;
  }>(
    '/characters',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'systemCode', 'attributes', 'speciesId', 'classes'],
          properties,
        },
      },
    },
    async (req, reply) => {
      const user = await auth.authenticate(req.cookies[ACCESS]),
        id = await service.create(user, req.body);
      return await reply.code(201).send(await service.detail(id, user));
    }
  );
  app.get<{
    Params: {
      id: number;
    };
  }>(
    '/characters/:id',
    { schema: { params } },
    async (req) =>
      await service.detail(
        req.params.id,
        req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined
      )
  );
  app.post<{
    Params: {
      id: number;
    };
    Body: CharacterInput;
  }>(
    '/characters/:id/changes/preview',
    {
      schema: {
        params,
        body: { type: 'object', minProperties: 1, additionalProperties: false, properties },
      },
    },
    async (req) =>
      await service.previewChanges(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        req.body
      )
  );
  app.patch<{
    Params: {
      id: number;
    };
    Body: CharacterInput & {
      confirmationToken?: string;
    };
  }>(
    '/characters/:id',
    {
      schema: {
        params,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            ...properties,
            confirmationToken: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          },
        },
      },
    },
    async (req) => {
      const user = await auth.authenticate(req.cookies[ACCESS]);
      const { confirmationToken, ...changes } = req.body;
      if (!Object.keys(changes).length)
        throw new AppError(400, 'INVALID_INPUT', 'Informe a alteração além do token');
      await service.update(req.params.id, user, changes, confirmationToken);
      return await service.detail(req.params.id, user);
    }
  );
  app.delete<{
    Params: {
      id: number;
    };
  }>('/characters/:id', { schema: { params } }, async (req, reply) => {
    await service.remove(req.params.id, await auth.authenticate(req.cookies[ACCESS]));
    return await reply.code(204).send();
  });
  for (const [path, action] of [
    ['publish', 'publish'],
    ['unpublish', 'unpublish'],
    ['hide', 'hide'],
    ['unblock-publication', 'unblock'],
  ] as const) {
    const prefix = action === 'hide' || action === 'unblock' ? '/admin' : '';
    app.post<{
      Params: {
        id: number;
      };
    }>(`${prefix}/characters/:id/${path}`, { schema: { params } }, async (req, reply) => {
      await service.publication(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        action
      );
      return await reply.code(204).send();
    });
  }
}
