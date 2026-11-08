import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { BenefitService, type BenefitInput, type GrantInput } from './service.js';
const id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const kind = { type: 'string', enum: ['feat', 'tool', 'language', 'skill'] };
const params = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id },
};
export function benefitRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const service = new BenefitService(db);
  app.get<{
    Params: {
      id: number;
    };
  }>(
    '/characters/:id/benefits',
    { schema: { params } },
    async (req) =>
      await service.list(
        req.params.id,
        req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined
      )
  );
  app.post<{
    Params: {
      id: number;
    };
    Body: GrantInput;
  }>(
    '/characters/:id/grants',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['originKind', 'originId', 'acquisitionContext', 'ruleKey', 'acquiredAtLevel'],
          properties: {
            originKind: {
              type: 'string',
              enum: ['class', 'subclass', 'species', 'background', 'feat'],
            },
            originId: id,
            acquisitionContext: {
              type: 'string',
              enum: [
                'initial_class',
                'multiclass_entry',
                'class_progression',
                'species',
                'background',
                'feat',
              ],
            },
            ruleKey: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
            acquiredAtLevel: { type: 'integer', minimum: 1, maximum: 20 },
          },
        },
      },
    },
    async (req, reply) =>
      await reply
        .code(201)
        .send(
          await service.grant(req.params.id, await auth.authenticate(req.cookies[ACCESS]), req.body)
        )
  );
  app.post<{
    Params: {
      id: number;
    };
    Body: BenefitInput;
  }>(
    '/characters/:id/benefits',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'localId', 'grantId', 'selectionKind'],
          properties: {
            kind,
            localId: id,
            grantId: id,
            selectionKind: { type: 'string', enum: ['fixed', 'chosen'] },
            choiceKey: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
            proficiencyRank: { type: 'integer', enum: [1, 2] },
            notes: { type: ['string', 'null'], maxLength: 10000 },
          },
        },
      },
    },
    async (req, reply) =>
      await reply
        .code(201)
        .send(
          await service.add(req.params.id, await auth.authenticate(req.cookies[ACCESS]), req.body)
        )
  );
  app.patch<{
    Params: {
      id: number;
      kind: BenefitInput['kind'];
      instanceId: number;
    };
    Body: {
      notes?: string | null;
      proficiencyRank?: number;
    };
  }>(
    '/characters/:id/benefits/:kind/:instanceId',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'kind', 'instanceId'],
          properties: { id, kind, instanceId: id },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            notes: { type: ['string', 'null'], maxLength: 10000 },
            proficiencyRank: { type: 'integer', enum: [1, 2] },
          },
        },
      },
    },
    async (req) =>
      await service.update(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        req.params.kind,
        req.params.instanceId,
        req.body
      )
  );
  app.post<{
    Params: {
      id: number;
      kind: BenefitInput['kind'];
      instanceId: number;
    };
  }>(
    '/characters/:id/benefits/:kind/:instanceId/removal-preview',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'kind', 'instanceId'],
          properties: { id, kind, instanceId: id },
        },
      },
    },
    async (req) =>
      await service.previewRemoval(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        req.params.kind,
        req.params.instanceId
      )
  );
  app.delete<{
    Params: {
      id: number;
      kind: BenefitInput['kind'];
      instanceId: number;
    };
    Querystring: {
      confirmationToken?: string;
    };
  }>(
    '/characters/:id/benefits/:kind/:instanceId',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { confirmationToken: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
        },
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'kind', 'instanceId'],
          properties: { id, kind, instanceId: id },
        },
      },
    },
    async (req, reply) => {
      await service.remove(
        req.params.id,
        await auth.authenticate(req.cookies[ACCESS]),
        req.params.kind,
        req.params.instanceId,
        req.query.confirmationToken
      );
      return await reply.code(204).send();
    }
  );
}
