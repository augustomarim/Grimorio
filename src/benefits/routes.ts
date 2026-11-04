import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
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
export function benefitRoutes(app: FastifyInstance, db: Database.Database, auth: AuthService) {
  const service = new BenefitService(db);
  app.get<{ Params: { id: number } }>('/characters/:id/benefits', { schema: { params } }, (req) =>
    service.list(
      req.params.id,
      req.cookies[ACCESS] ? auth.authenticate(req.cookies[ACCESS]) : undefined
    )
  );
  app.post<{ Params: { id: number }; Body: GrantInput }>(
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
    (req, reply) =>
      reply
        .code(201)
        .send(service.grant(req.params.id, auth.authenticate(req.cookies[ACCESS]), req.body))
  );
  app.post<{ Params: { id: number }; Body: BenefitInput }>(
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
    (req, reply) =>
      reply
        .code(201)
        .send(service.add(req.params.id, auth.authenticate(req.cookies[ACCESS]), req.body))
  );
  app.patch<{
    Params: { id: number; kind: BenefitInput['kind']; instanceId: number };
    Body: { notes?: string | null; proficiencyRank?: number };
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
    (req) =>
      service.update(
        req.params.id,
        auth.authenticate(req.cookies[ACCESS]),
        req.params.kind,
        req.params.instanceId,
        req.body
      )
  );
  app.delete<{ Params: { id: number; kind: BenefitInput['kind']; instanceId: number } }>(
    '/characters/:id/benefits/:kind/:instanceId',
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
    (req, reply) => {
      service.remove(
        req.params.id,
        auth.authenticate(req.cookies[ACCESS]),
        req.params.kind,
        req.params.instanceId
      );
      return reply.code(204).send();
    }
  );
}
