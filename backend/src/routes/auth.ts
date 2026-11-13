import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthService, Credentials } from '../auth/service.js';
import { publicUser } from '../auth/service.js';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
export const ACCESS = 'grimorio_access',
  REFRESH = 'grimorio_refresh';
const email = { type: 'string', format: 'email', maxLength: 254 };
const password = { type: 'string', minLength: 12, maxLength: 128 };
const username = { type: 'string', minLength: 3, maxLength: 32, pattern: '^\\S(?:.*\\S)?$' };
const rawToken = { type: 'string', minLength: 40, maxLength: 512, pattern: '^[A-Za-z0-9_-]+$' };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
export function authRoutes(app: FastifyInstance, auth: AuthService, config: Config) {
  const cookie = {
    httpOnly: true,
    secure: (config.apiOrigin ?? config.origin).startsWith('https:'),
    sameSite: config.cookieSameSite ?? 'lax',
  };
  const accessPath = config.apiPrefix || '/';
  const refreshPath = (config.apiPrefix ?? '') + '/auth';
  const set = (reply: FastifyReply, c: Credentials) => {
    reply.setCookie(ACCESS, c.access, {
      ...cookie,
      path: accessPath,
      expires: new Date(c.accessExpires),
    });
    reply.setCookie(REFRESH, c.refresh, {
      ...cookie,
      path: refreshPath,
      expires: new Date(c.familyExpires),
    });
    return { user: c.user, accessExpiresAt: c.accessExpires };
  };
  const clear = (reply: FastifyReply) => {
    reply.clearCookie(ACCESS, { ...cookie, path: accessPath });
    reply.clearCookie(REFRESH, { ...cookie, path: refreshPath });
  };
  const generic = { message: 'Se os dados estiverem elegíveis, enviaremos as instruções.' };
  app.post<{
    Body: {
      email: string;
      username: string;
      password: string;
    };
  }>(
    '/auth/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        body: object({
          email,
          username,
          password,
        }),
      },
    },
    async (req, reply) => {
      await auth.register(req.body.email, req.body.username, req.body.password);
      return await reply.code(202).send({ message: 'Solicitação de cadastro processada.' });
    }
  );
  app.post<{
    Body: {
      email: string;
      password: string;
    };
  }>(
    '/auth/login',
    {
      schema: {
        body: object({ email, password: { type: 'string', minLength: 1, maxLength: 128 } }),
      },
    },
    async (req, reply) =>
      set(
        reply,
        await auth.login(
          req.body.email,
          req.body.password,
          req.ip,
          String(req.headers['user-agent'] ?? '')
        )
      )
  );
  app.get('/auth/me', async (req) => ({
    user: publicUser(await auth.authenticate(req.cookies[ACCESS])),
  }));
  app.post<{ Body: { username: string; avatar?: string | null } }>('/auth/profile', {
    bodyLimit: 70 * 1024,
    schema: { body: object({
      username,
      avatar: { type: ['string', 'null'], maxLength: 65536, pattern: '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' },
    }, ['username']) },
  }, async (req) => ({
    user: await auth.updateProfile(await auth.authenticate(req.cookies[ACCESS]), req.body.username, req.body.avatar),
  }));
  app.post<{ Body: { currentPassword: string; password: string } }>('/auth/password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: { body: object({ currentPassword: { type: 'string', minLength: 1, maxLength: 128 }, password }) },
  }, async (req, reply) => set(reply, await auth.changePassword(
    await auth.authenticate(req.cookies[ACCESS]), req.body.currentPassword, req.body.password,
    req.ip, String(req.headers['user-agent'] ?? ''),
  )));
  app.post('/auth/refresh', async (req, reply) =>
    set(reply, await auth.refresh(req.cookies[REFRESH]))
  );
  app.post('/auth/logout', async (req, reply) => {
    await auth.logout(req.cookies[ACCESS], req.cookies[REFRESH]);
    clear(reply);
    return await reply.code(204).send();
  });
  app.post('/auth/logout-all', async (req, reply) => {
    await auth.logoutAll(await auth.authenticate(req.cookies[ACCESS]));
    clear(reply);
    return await reply.code(204).send();
  });
  app.post<{
    Body: {
      email: string;
    };
  }>(
    '/auth/password-reset/request',
    {
      config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
      schema: { body: object({ email }) },
    },
    async (req, reply) => {
      if (config.mailMode === 'disabled')
        throw new AppError(503, 'PASSWORD_RESET_UNAVAILABLE', 'A recuperação de senha por e-mail está desativada.');
      await auth.requestPasswordReset(req.body.email);
      return await reply.code(202).send(generic);
    }
  );
  app.post<{
    Body: {
      token: string;
      password: string;
    };
  }>(
    '/auth/password-reset/confirm',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: object({ token: rawToken, password }),
      },
    },
    async (req, reply) => {
      await auth.resetPassword(req.body.token, req.body.password);
      clear(reply);
      return await reply.code(204).send();
    }
  );
}
