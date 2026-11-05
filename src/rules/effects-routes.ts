import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { CharacterService } from '../characters/service.js';
import { AttributeChoices, abilities } from './attributes.js';
import { EffectEngine } from './effects.js';
import { BenefitService, type BenefitInput } from '../benefits/service.js';
const id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
export function effectsRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const characters = new CharacterService(db),
    engine = new EffectEngine(db),
    attributes = new AttributeChoices(db);
  app.get<{
    Params: {
      id: number;
    };
  }>(
    '/characters/:id/effects',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id },
        },
      },
    },
    async (req) => {
      await characters.requireReadable(
        req.params.id,
        req.cookies[ACCESS] ? await auth.authenticate(req.cookies[ACCESS]) : undefined
      );
      return await db.transaction(async () => await engine.report(req.params.id)).deferred();
    }
  );
  app.put<{
    Params: {
      id: number;
      grantId: number;
      ruleId: string;
    };
    Body: {
      abilities: (typeof abilities)[number][];
    };
  }>(
    '/characters/:id/effects/:grantId/ability-boosts/:ruleId',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'grantId', 'ruleId'],
          properties: { id, grantId: id, ruleId: { type: 'string', minLength: 1, maxLength: 200 } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['abilities'],
          properties: {
            abilities: { type: 'array', maxItems: 30, items: { type: 'string', enum: abilities } },
          },
        },
      },
    },
    async (req) => {
      const user = await auth.authenticate(req.cookies[ACCESS]);
      return await db
        .transaction(async () => {
          await characters.requireOwner(req.params.id, user);
          const result = await attributes.select(
            req.params.id,
            req.params.grantId,
            req.params.ruleId,
            req.body.abilities
          );
          await db
            .prepare('UPDATE character SET updated_at=? WHERE id=?')
            .run(new Date().toISOString(), req.params.id);
          await db
            .prepare(
              'UPDATE dnd_character SET ruleset_revision_id=(SELECT id FROM ruleset_revision ORDER BY id DESC LIMIT 1) WHERE character_id=?'
            )
            .run(req.params.id);
          await db
            .prepare(
              "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,'effects.ability-boost','character',?,?)"
            )
            .run(
              user.id,
              req.params.id,
              JSON.stringify({
                grantId: req.params.grantId,
                ruleId: req.params.ruleId,
                abilities: req.body.abilities,
              })
            );
          return result;
        })
        .immediate();
    }
  );
  app.post<{
    Params: {
      id: number;
      grantId: number;
    };
    Body: Omit<BenefitInput, 'grantId'>;
  }>(
    '/characters/:id/effects/:grantId/benefits',
    {
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'grantId'],
          properties: { id, grantId: id },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'localId', 'selectionKind'],
          properties: {
            kind: { type: 'string', enum: ['feat', 'skill', 'tool', 'language'] },
            localId: id,
            selectionKind: { type: 'string', enum: ['fixed', 'chosen'] },
            choiceKey: { type: 'string', minLength: 1, maxLength: 200 },
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
          await new BenefitService(db).add(
            req.params.id,
            await auth.authenticate(req.cookies[ACCESS]),
            { ...req.body, grantId: req.params.grantId },
            true
          )
        )
  );
}
