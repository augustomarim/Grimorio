import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthService, Credentials } from '../auth/service.js';
import { publicUser } from '../auth/service.js';
import type { Config } from '../config.js';
export const ACCESS = 'grimorio_access',
  REFRESH = 'grimorio_refresh';
const email = { type: 'string', format: 'email', maxLength: 254 };
const password = { type: 'string', minLength: 12, maxLength: 128 };
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
    secure: config.origin.startsWith('https:'),
    sameSite: 'lax' as const,
  };
  const set = (reply: FastifyReply, c: Credentials) => {
    reply.setCookie(ACCESS, c.access, { ...cookie, path: '/', expires: new Date(c.accessExpires) });
    reply.setCookie(REFRESH, c.refresh, {
      ...cookie,
      path: '/auth',
      expires: new Date(c.familyExpires),
    });
    return { user: c.user, accessExpiresAt: c.accessExpires };
  };
  const clear = (reply: FastifyReply) => {
    reply.clearCookie(ACCESS, { ...cookie, path: '/' });
    reply.clearCookie(REFRESH, { ...cookie, path: '/auth' });
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
          username: { type: 'string', minLength: 3, maxLength: 32, pattern: '^\\S(?:.*\\S)?$' },
          password,
        }),
      },
    },
    async (req, reply) => {
      await auth.register(req.body.email, req.body.username, req.body.password);
      return await reply.code(202).send(generic);
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
  for (const purpose of ['email_verification', 'password_reset'] as const) {
    const path = purpose === 'email_verification' ? 'email-verification' : 'password-reset';
    app.post<{
      Body: {
        email: string;
      };
    }>(
      `/auth/${path}/request`,
      {
        config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
        schema: { body: object({ email }) },
      },
      async (req, reply) => {
        await auth.requestToken(req.body.email, purpose);
        return await reply.code(202).send(generic);
      }
    );
    app.post<{
      Body: {
        token: string;
        password?: string;
      };
    }>(
      `/auth/${path}/confirm`,
      {
        config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
        schema: {
          body: object(
            purpose === 'password_reset' ? { token: rawToken, password } : { token: rawToken }
          ),
        },
      },
      async (req, reply) => {
        await auth.consume(req.body.token, purpose, req.body.password);
        if (purpose === 'password_reset') clear(reply);
        return await reply.code(204).send();
      }
    );
  }
}
