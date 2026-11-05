import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { DerivedService } from './derived.js';
import { CapabilityService } from './capabilities.js';
import { BenefitAudit } from './benefits.js';
import { AppError } from '../errors.js';
import { CharacterService } from '../characters/service.js';
import { ValidationService } from './validation.js';
export function validationRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const service = new ValidationService(db);
  app.get<{
    Params: {
      id: number;
    };
  }>(
    '/characters/:id/derived',
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
    async (req) =>
      await new DerivedService(db).report(
        req.params.id,
        req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined
      )
  );
  app.get<{
    Params: {
      id: number;
    };
  }>(
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
    async (req) =>
      await service.report(
        req.params.id,
        req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined
      )
  );
  app.get<{
    Params: {
      id: number;
    };
  }>(
    '/characters/:id/benefits/options',
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
    async (req) => {
      const user = req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined;
      return await db
        .transaction(async () => {
          await new CharacterService(db).requireReadable(req.params.id, user);
          if (
            !(await db
              .prepare('SELECT 1 FROM dnd_character WHERE character_id=?')
              .get(req.params.id))
          )
            throw new AppError(
              409,
              'VALIDATION_UNAVAILABLE',
              'Validação disponível apenas para D&D'
            );
          return {
            items: (await new BenefitAudit(db).inspect(req.params.id)).options,
            rulesVerified: false,
          };
        })
        .deferred();
    }
  );
  const capacities = new CapabilityService(db);
  for (const route of ['casting', 'class-benefits'] as const) {
    app.get<{
      Params: {
        id: number;
      };
    }>(
      `/characters/:id/${route}`,
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
      async (req) => {
        const user = req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined;
        return route === 'casting'
          ? await capacities.casting(req.params.id, user)
          : await capacities.benefits(req.params.id, user);
      }
    );
  }
}
