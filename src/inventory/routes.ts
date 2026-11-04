import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AuthService } from '../auth/service.js';
import { ACCESS } from '../routes/auth.js';
import { InventoryService, type NewItem, type ItemChanges } from './service.js';
import type { InventoryQuery } from './repository.js';
const id = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const quantity = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const mutable = {
  quantity,
  equipped: { type: 'boolean' },
  notes: { type: ['string', 'null'], maxLength: 10000 },
};
const characterParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id },
};
const itemParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'itemInstanceId'],
  properties: { id, itemInstanceId: id },
};
export function inventoryRoutes(app: FastifyInstance, db: Database.Database, auth: AuthService) {
  const service = new InventoryService(db);
  const optionalUser = (cookie: string | undefined) =>
    cookie ? auth.authenticate(cookie) : undefined;
  app.get<{ Params: { id: number }; Querystring: InventoryQuery }>(
    '/characters/:id/items',
    {
      schema: {
        params: characterParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            equipped: { type: 'boolean' },
            q: { type: 'string', maxLength: 100 },
          },
        },
      },
    },
    (req) => service.list(req.params.id, optionalUser(req.cookies[ACCESS]), req.query)
  );
  app.get<{ Params: { id: number; itemInstanceId: number } }>(
    '/characters/:id/items/:itemInstanceId',
    { schema: { params: itemParams } },
    (req) =>
      service.get(req.params.id, req.params.itemInstanceId, optionalUser(req.cookies[ACCESS]))
  );
  app.post<{ Params: { id: number }; Body: NewItem }>(
    '/characters/:id/items',
    {
      schema: {
        params: characterParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['itemId'],
          properties: { itemId: id, ...mutable },
        },
      },
    },
    (req, reply) =>
      reply
        .code(201)
        .send(service.create(req.params.id, auth.authenticate(req.cookies[ACCESS]), req.body))
  );
  app.patch<{ Params: { id: number; itemInstanceId: number }; Body: ItemChanges }>(
    '/characters/:id/items/:itemInstanceId',
    {
      schema: {
        params: itemParams,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: mutable,
        },
      },
    },
    (req) =>
      service.update(
        req.params.id,
        req.params.itemInstanceId,
        auth.authenticate(req.cookies[ACCESS]),
        req.body
      )
  );
  app.delete<{ Params: { id: number; itemInstanceId: number } }>(
    '/characters/:id/items/:itemInstanceId',
    { schema: { params: itemParams } },
    (req, reply) => {
      service.remove(
        req.params.id,
        req.params.itemInstanceId,
        auth.authenticate(req.cookies[ACCESS])
      );
      return reply.code(204).send();
    }
  );
}
