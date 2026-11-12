import { proxyTrust } from './proxy.js';
import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Database } from './db/database.js';
import type { Config } from './config.js';
import type { Mailer } from './auth/mail.js';
import {
  DisabledMailer,
  FileMailer,
  SmtpMailer,
  ResendMailer,
  ResendDeliveryError,
} from './auth/mail.js';
import { hashPassword, token } from './auth/crypto.js';
import { AuthService } from './auth/service.js';
import { openDatabase } from './db/database.js';
import { migrate, verifyHistory, requireCurrentSchema } from './db/migrations.js';
import { AppError } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { characterRoutes } from './characters/routes.js';
import { builderRoutes } from './characters/builder-routes.js';
import { catalogStatus } from './catalog/status.js';
import { catalogRoutes } from './catalog/routes.js';
import { effectsRoutes } from './rules/effects-routes.js';
import { choiceRoutes } from './choices/routes.js';
import { validationRoutes } from './rules/routes.js';
import { spellRoutes } from './spells/routes.js';
import { benefitRoutes } from './benefits/routes.js';
import { inventoryRoutes } from './inventory/routes.js';
export interface AppOptions {
  config: Config;
  database?: Database;
  mailer?: Mailer;
  now?: () => Date;
  logger?: boolean;
  verifyDatabase?: boolean;
}
export async function buildApp(options: AppOptions) {
  const config = options.config,
    db = options.database ?? openDatabase(config.databaseUrl);
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
    trustProxy: proxyTrust(config.trustedProxies ?? []),
    forceCloseConnections: 'idle',
    ajv: { customOptions: { removeAdditional: false } },
    logController: new LogController({ disableRequestLogging: true }),
  });
  try {
    const verifyDatabase = config.environment === 'production' || options.verifyDatabase;
    const schemaVersion = verifyDatabase ? await requireCurrentSchema(db) : await migrate(db);
    if (verifyDatabase && !(await catalogStatus(db)).ready)
      throw new Error('Catálogo incompleto: execute catalog:import antes de iniciar a API');
    if (!verifyDatabase)
      await db
        .prepare(
          "INSERT INTO rpg_system(code,name,edition,is_enabled) VALUES('dnd-2024','Dungeons & Dragons','2024',1) ON CONFLICT(code) DO NOTHING"
        )
        .run();
    await app.register(cookie);
    await app.register(helmet);
    await app.register(cors, {
      origin: (origin, callback) => callback(null, origin === config.origin),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type'],
    });
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    app.addHook('onRequest', async (req, reply) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.origin)
        throw new AppError(403, 'ORIGIN_DENIED', 'Origem da requisição não permitida');
    });
    app.addHook('onSend', async (_req, reply, payload) => {
      reply.header('Cache-Control', 'private, no-store');
      return payload;
    });
    const baseMailer =
      options.mailer ??
      (config.mailMode === 'resend' && config.resend
        ? new ResendMailer(config.resend, config.origin)
        : config.mailMode === 'smtp' && config.smtp
          ? new SmtpMailer(config.smtp, config.origin)
          : config.mailMode === 'file'
            ? new FileMailer(config.mailDirectory)
            : new DisabledMailer());
    const safeMailer: Mailer = {
      send: async (mail) => {
        try {
          await baseMailer.send(mail);
        } catch (error) {
          app.log.error(
            {
              event: 'mail_delivery_failed',
              mailMode: config.mailMode,
              ...(error instanceof ResendDeliveryError
                ? { reason: error.reason, providerStatus: error.status }
                : {}),
            },
            'Falha ao enviar e-mail. Solicite o reenvio.'
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
    app.setErrorHandler(async (error, req, reply) => {
      const err = (error instanceof Error ? error : new Error('Erro desconhecido')) as Error & {
        validation?: unknown;
        statusCode?: number;
        code?: string;
      };
      if (error instanceof AppError && error.statusCode === 503) reply.header('Retry-After', '5');
      if (error instanceof AppError)
        return await reply
          .code(error.statusCode)
          .send({ error: { code: error.code, message: error.message } });
      if (err.validation)
        return await reply
          .code(400)
          .send({ error: { code: 'INVALID_INPUT', message: 'Dados de entrada inválidos' } });
      if (err.statusCode === 429)
        return await reply.code(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
          },
        });
      const inputErrors: Record<
        string,
        {
          status: number;
          code: string;
          message: string;
        }
      > = {
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
        return await reply
          .code(inputError.status)
          .send({ error: { code: inputError.code, message: inputError.message } });
      if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500)
        return await reply
          .code(err.statusCode)
          .send({ error: { code: 'INVALID_REQUEST', message: 'Requisição inválida.' } });
      if (
        (err.code &&
          (['55P03', '57014', '53300', '57P01', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(
            err.code
          ) ||
            err.code.startsWith('08'))) ||
        err.message === 'Query read timeout'
      )
        return await reply
          .header('Retry-After', '5')
          .code(503)
          .send({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Serviço temporariamente indisponível. Tente novamente.',
              requestId: req.id,
            },
          });
      if (err.code && ['23502', '23503', '23505', '23514', '22P02', '22003'].includes(err.code))
        return await reply.code(400).send({
          error: {
            code: 'CONSTRAINT_VIOLATION',
            message: 'Os dados violam uma restrição do banco',
          },
        });
      req.log.error({ errorType: err.name, code: err.code }, 'Erro interno');
      return await reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor', requestId: req.id },
      });
    });
    app.setNotFoundHandler(async (_req, reply) =>
      reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada' } })
    );

    await app.register(
      async (api) => {
        authRoutes(api, auth, config);
        catalogRoutes(api, db);
        characterRoutes(api, db, auth);
        builderRoutes(api, db, auth);
        inventoryRoutes(api, db, auth);
        benefitRoutes(api, db, auth);
        spellRoutes(api, db, auth);
        validationRoutes(api, db, auth);
        choiceRoutes(api, db, auth);
        effectsRoutes(api, db, auth);
        api.get('/admin/runtime', async (req) => {
          const user = await auth.authenticate(req.cookies.grimorio_access);
          if (user.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Recurso administrativo');
          return {
            network: { peerIp: req.raw.socket.remoteAddress, clientIp: req.ip },
            configuration: {
              apiPrefix: config.apiPrefix ?? '',
              cookieSameSite: config.cookieSameSite ?? 'lax',
              mailMode: config.mailMode,
            },
          };
        });
      },
      { prefix: config.apiPrefix ?? '' }
    );
    app.get('/live', { config: { rateLimit: false } }, async () => ({ status: 'alive' }));
    app.get('/health', { config: { rateLimit: false } }, async () => {
      let current: number;
      try {
        current = await verifyHistory(db);
      } catch (error) {
        if (error instanceof Error && 'code' in error) throw error;
        throw new AppError(503, 'SCHEMA_MISMATCH', 'Histórico do banco incompatível');
      }
      if (current !== schemaVersion)
        throw new AppError(503, 'SCHEMA_MISMATCH', 'Versão do banco incompatível');
      const catalog = await catalogStatus(db);
      if (verifyDatabase && !catalog.ready)
        throw new AppError(503, 'CATALOG_NOT_LOADED', 'Catálogo incompleto');
      return {
        status: 'ok',
        schemaVersion,
        databaseEngine: 'postgresql',
        databaseVersion: (
          (await db.prepare("SELECT current_setting('server_version') AS version").get()) as {
            version: string;
          }
        ).version,
        catalogEntries: catalog.total,
      };
    });
    app.addHook('onClose', async () => {
      await db.close();
    });
    await app.ready();
    return { app, db, auth };
  } catch (error) {
    await app.close();
    if (db.open) await db.close();
    throw error;
  }
}
