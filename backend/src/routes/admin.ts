import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService } from '../auth/service.js';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import { ACCESS } from './auth.js';

interface ListQuery {
  page?: number;
  search?: string;
}

const noticeBody = {
  type: 'object',
  additionalProperties: false,
  required: ['message'],
  properties: { message: { type: 'string', minLength: 1, maxLength: 2000, pattern: '\\S' } },
} as const;

const querystring = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, maximum: 100000 },
    search: { type: 'string', maxLength: 120 },
  },
};
const accountParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1, maximum: 2147483647 } },
};
const sheetParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};
const pageSize = 20;

export function adminRoutes(app: FastifyInstance, db: Database, auth: AuthService) {
  const operator = async (req: FastifyRequest) => {
    const user = await auth.authenticate(req.cookies[ACCESS]);
    if (user.role !== 'admin')
      throw new AppError(403, 'FORBIDDEN', 'Acesso restrito à administração');
    return user;
  };

  app.get<{ Querystring: ListQuery }>(
    '/admin/accounts',
    { schema: { querystring } },
    async (req, reply) => {
      await operator(req);
      const { page = 1, search = '' } = req.query;
      const term = search.trim();
      const rows = await db
        .prepare(
          `SELECT id,username,email,role,is_active AS "isActive",
                  moderation_message AS message,moderation_appeal AS appeal,deactivated_by AS "deactivatedBy"
       FROM app_user
       WHERE strpos(lower(username),lower(?))>0 OR strpos(lower(email),lower(?))>0
       ORDER BY id DESC LIMIT ? OFFSET ?`
        )
        .all(term, term, pageSize + 1, (page - 1) * pageSize);
      reply.header('Cache-Control', 'no-store');
      return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
    }
  );

  app.get<{ Querystring: ListQuery }>(
    '/admin/sheets',
    { schema: { querystring } },
    async (req, reply) => {
      await operator(req);
      const { page = 1, search = '' } = req.query;
      const term = search.trim();
      const rows = await db
        .prepare(
          `SELECT b.id,b.data->>'name' AS name,u.username AS author,b.publication_blocked AS blocked,
              b.is_public AND u.is_active=1 AS visible,
              b.moderation_message AS message,b.moderation_appeal AS appeal
       FROM builder_document b JOIN app_user u ON u.id=b.owner_id
       WHERE (b.is_public OR b.publication_blocked)
         AND (strpos(lower(b.data->>'name'),lower(?))>0 OR strpos(lower(u.username),lower(?))>0)
       ORDER BY b.updated_at DESC,b.id DESC LIMIT ? OFFSET ?`
        )
        .all(term, term, pageSize + 1, (page - 1) * pageSize);
      reply.header('Cache-Control', 'no-store');
      return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
    }
  );

  for (const action of ['deactivate', 'reactivate'] as const) {
    app.post<{ Params: { id: number }; Body?: { message: string } }>(
      `/admin/accounts/:id/${action}`,
      {
        schema: { params: accountParams, ...(action === 'deactivate' ? { body: noticeBody } : {}) },
      },
      async (req, reply) => {
        const admin = await operator(req);
        const { id } = req.params;
        await db
          .transaction(async () => {
            const account = await db
              .prepare(
                'SELECT role,is_active,deactivated_at,deactivated_by FROM app_user WHERE id=? FOR UPDATE'
              )
              .get(id);
            if (!account) throw new AppError(404, 'NOT_FOUND', 'Conta não encontrada');
            if (account.role === 'admin')
              throw new AppError(403, 'FORBIDDEN', 'Contas administrativas são protegidas');
            const active = action === 'reactivate';
            if (active && account.deactivated_by === 'owner')
              throw new AppError(
                409,
                'OWNER_DEACTIVATED',
                'O titular reativa esta conta ao entrar'
              );
            if (Boolean(account.is_active) === active)
              throw new AppError(409, 'ACCOUNT_STATE_CHANGED', 'O estado da conta já foi alterado');
            if (
              active &&
              account.deactivated_at &&
              Date.now() - new Date(account.deactivated_at).getTime() >= 30 * 86400000
            )
              throw new AppError(409, 'ACCOUNT_EXPIRED', 'O prazo de reativação da conta terminou');
            await db
              .prepare(
                `UPDATE app_user SET is_active=?,moderation_message=?,moderation_appeal=NULL,
                 deactivated_at=?,deactivated_by=?,updated_at=? WHERE id=?`
              )
              .run(
                Number(active),
                active ? null : req.body!.message.trim(),
                active ? null : new Date(),
                active ? null : 'admin',
                new Date().toISOString(),
                id
              );
            if (!active) {
              await db.prepare('DELETE FROM session WHERE user_id=?').run(id);
              await db.prepare('DELETE FROM auth_token WHERE user_id=?').run(id);
            }
            await db
              .prepare(
                'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)'
              )
              .run(admin.id, `account.${action}`, 'app_user', id);
          })
          .immediate();
        return reply.code(204).send();
      }
    );
  }

  for (const action of ['block', 'unblock'] as const) {
    app.post<{ Params: { id: string }; Body?: { message: string } }>(
      `/admin/sheets/:id/${action}`,
      {
        schema: { params: sheetParams, ...(action === 'block' ? { body: noticeBody } : {}) },
      },
      async (req, reply) => {
        const admin = await operator(req);
        const { id } = req.params;
        await db
          .transaction(async () => {
            const row = await db
              .prepare(
                `UPDATE builder_document SET publication_blocked=?,is_public=FALSE,
                  moderation_message=?,moderation_appeal=NULL
           WHERE id=? AND publication_blocked<>? AND (is_public OR publication_blocked) RETURNING owner_id`
              )
              .get(
                action === 'block',
                action === 'block' ? req.body!.message.trim() : null,
                id,
                action === 'block'
              );
            if (!row) throw new AppError(404, 'NOT_FOUND', 'Publicação não encontrada');
            await db
              .prepare(
                'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)'
              )
              .run(
                admin.id,
                `builder.${action}`,
                'app_user',
                row.owner_id,
                JSON.stringify({ documentId: id })
              );
          })
          .immediate();
        return reply.code(204).send();
      }
    );
  }
}
