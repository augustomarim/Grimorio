import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { ChoiceService, type ChoiceInput } from './service.js';
export function choiceRoutes(app: FastifyInstance, db: Database.Database, auth: AuthService) {
  const service = new ChoiceService(db),
    id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    key = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    params = { type: 'object', additionalProperties: false, required: ['id'], properties: { id } };
  app.get<{ Params: { id: number } }>('/characters/:id/choices', { schema: { params } }, (req) =>
    service.list(
      req.params.id,
      req.cookies[ACCESS] ? auth.authenticate(req.cookies[ACCESS]) : undefined
    )
  );
  app.post<{ Params: { id: number }; Body: ChoiceInput }>(
    '/characters/:id/choices',
    {
      schema: {
        params,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['grantId', 'choiceId', 'optionId'],
          properties: { grantId: id, choiceId: key, optionId: key },
        },
      },
    },
    (req, reply) =>
      reply
        .code(201)
        .send(service.add(req.params.id, auth.authenticate(req.cookies[ACCESS]), req.body))
  );
  app.delete<{ Params: { id: number; instanceId: number } }>(
    '/characters/:id/choices/:instanceId',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'instanceId'],
          properties: { id, instanceId: id },
        },
      },
    },
    (req, reply) => {
      service.remove(req.params.id, auth.authenticate(req.cookies[ACCESS]), req.params.instanceId);
      return reply.code(204).send();
    }
  );
}
