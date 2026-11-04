import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type Database from 'better-sqlite3';
import type { Config } from './config.js';
import type { Mailer } from './auth/mail.js';
import { DisabledMailer, FileMailer } from './auth/mail.js';
import { hashPassword, token } from './auth/crypto.js';
import { AuthService } from './auth/service.js';
import { openDatabase } from './db/database.js';
import { migrate, verifyHistory } from './db/migrations.js';
import { AppError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { characterRoutes } from './characters/routes.js';
import { catalogRoutes } from './catalog/routes.js';
import { inventoryRoutes } from './inventory/routes.js';

export interface AppOptions {
  config: Config;
  database?: Database.Database;
  mailer?: Mailer;
  now?: () => Date;
  logger?: boolean;
}
export async function buildApp(options: AppOptions) {
  const config = options.config,
    db = options.database ?? openDatabase(config.databasePath);
  const app = Fastify({
    logger: options.logger
      ? {
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers[\"set-cookie\"]',
              'password',
              'token',
            ],
            remove: true,
          },
        }
      : false,
    bodyLimit: 128 * 1024,
    trustProxy: false,
    ajv: { customOptions: { removeAdditional: false } },
    logController: new LogController({ disableRequestLogging: true }),
  });
  try {
    const schemaVersion = migrate(db);
    db.prepare(
      "INSERT INTO rpg_system(code,name,edition,is_enabled) VALUES('dnd-2024','Dungeons & Dragons','2024',1) ON CONFLICT(code) DO NOTHING"
    ).run();
    await app.register(cookie);
    await app.register(helmet);
    await app.register(cors, {
      origin: (origin, callback) => callback(null, origin === config.origin),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type'],
    });
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    app.addHook('onRequest', async (req, reply) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.origin)
        throw new AppError(403, 'ORIGIN_DENIED', 'Origem da requisição não permitida');
      if (
        req.url.startsWith('/auth') ||
        req.url.startsWith('/characters') ||
        req.url.startsWith('/admin')
      )
        reply.header('Cache-Control', 'private, no-store');
    });
    const baseMailer =
      options.mailer ??
      (config.mailMode === 'file' ? new FileMailer(config.mailDirectory) : new DisabledMailer());
    const safeMailer: Mailer = {
      send: async (mail) => {
        try {
          await baseMailer.send(mail);
        } catch {
          app.log.error(
            { event: 'mail_delivery_failed' },
            'Falha de entrega de e-mail; reenvio necessário'
          );
        }
      },
    };
    const auth = new AuthService(
      db,
      config.authKey,
      await hashPassword(token()),
      safeMailer,
      options.now
    );
    authRoutes(app, auth, config);
    catalogRoutes(app, db);
    characterRoutes(app, db, auth);
    inventoryRoutes(app, db, auth);
    app.get('/health', () => {
      let current: number;
      try {
        current = verifyHistory(db);
      } catch {
        throw new AppError(503, 'SCHEMA_MISMATCH', 'Histórico do banco incompatível');
      }
      if (current !== schemaVersion)
        throw new AppError(503, 'SCHEMA_MISMATCH', 'Versão do banco incompatível');
      return {
        status: 'ok',
        schemaVersion,
        sqliteVersion: (
          db.prepare('SELECT sqlite_version() AS version').get() as { version: string }
        ).version,
        catalogEntries: (
          db.prepare('SELECT count(*) AS count FROM catalog_entry').get() as { count: number }
        ).count,
      };
    });
    app.setErrorHandler((error, req, reply) => {
      const err = (error instanceof Error ? error : new Error('Erro desconhecido')) as Error & {
        validation?: unknown;
        statusCode?: number;
        code?: string;
      };
      if (error instanceof AppError)
        return reply
          .code(error.statusCode)
          .send({ error: { code: error.code, message: error.message } });
      if (err.validation)
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_INPUT', message: 'Dados de entrada inválidos' } });
      if (err.statusCode === 429)
        return reply.code(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
          },
        });
      const inputErrors: Record<string, { status: number; code: string; message: string }> = {
        FST_ERR_CTP_EMPTY_JSON_BODY: {
          status: 400,
          code: 'INVALID_JSON',
          message: 'O corpo JSON está vazio. Preencha Body → JSON.',
        },
        FST_ERR_CTP_INVALID_JSON_BODY: {
          status: 400,
          code: 'INVALID_JSON',
          message: 'JSON inválido. Confira aspas, vírgulas e chaves em Body → JSON.',
        },
        FST_ERR_CTP_INVALID_MEDIA_TYPE: {
          status: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Use Content-Type: application/json.',
        },
        FST_ERR_CTP_BODY_TOO_LARGE: {
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'O corpo da requisição excede o limite permitido.',
        },
        FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
          status: 400,
          code: 'INVALID_REQUEST',
          message: 'Tamanho do corpo da requisição inválido.',
        },
      };
      const inputError = err.code ? inputErrors[err.code] : undefined;
      if (inputError)
        return reply
          .code(inputError.status)
          .send({ error: { code: inputError.code, message: inputError.message } });
      if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500)
        return reply
          .code(err.statusCode)
          .send({ error: { code: 'INVALID_REQUEST', message: 'Requisição inválida.' } });
      if (err.code?.startsWith('SQLITE_CONSTRAINT'))
        return reply.code(400).send({
          error: {
            code: 'CONSTRAINT_VIOLATION',
            message: 'Os dados violam uma restrição do banco',
          },
        });
      req.log.error({ errorType: err.name, code: err.code }, 'Erro interno');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', requestId: req.id },
      });
    });
    app.addHook('onClose', async () => {
      db.close();
    });
    await app.ready();
    return { app, db, auth };
  } catch (error) {
    await app.close();
    if (db.open) db.close();
    throw error;
  }
}
