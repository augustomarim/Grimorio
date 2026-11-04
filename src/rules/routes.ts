import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { ValidationService } from './validation.js';
export function validationRoutes(app: FastifyInstance, db: Database.Database, auth: AuthService) {
  const service = new ValidationService(db);
  app.get<{ Params: { id: number } }>(
    '/characters/:id/validation',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
        },
      },
    },
    (req) =>
      service.report(
        req.params.id,
        req.cookies[ACCESS] ? auth.authenticate(req.cookies[ACCESS]) : undefined
      )
  );
}
