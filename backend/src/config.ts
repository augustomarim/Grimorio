import { proxyTrust } from './proxy.js';
import { resolve } from 'node:path';
export interface Config {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  origin: string;
  authKey: string;
  mailMode: 'disabled' | 'file' | 'smtp' | 'resend';
  apiPrefix?: string;
  apiOrigin?: string;
  cookieSameSite?: 'lax' | 'strict' | 'none';
  resend?: { apiKey: string; from: string };
  trustedProxies?: string[];
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  mailDirectory: string;
}
function webUrl(value: string, name: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} inválida`);
  }
}
export function loadConfig(env = process.env): Config {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment))
    throw new Error('NODE_ENV inválido');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválida');
  const origin = webUrl(
    env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
    'APP_ORIGIN'
  );
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error('APP_ORIGIN deve ser uma origem HTTP(S)');
  if (environment === 'production' && origin.protocol !== 'https:')
    throw new Error('Produção exige HTTPS');
  if (!env.AUTH_KEY || env.AUTH_KEY.length < 32)
    throw new Error('Configure AUTH_KEY aleatória com pelo menos 32 caracteres');
  const mailMode = env.MAIL_MODE ?? 'disabled';
  if (!['disabled', 'file', 'smtp', 'resend'].includes(mailMode))
    throw new Error('MAIL_MODE inválido');
  if (environment === 'production' && !['smtp', 'resend'].includes(mailMode))
    throw new Error('Produção exige MAIL_MODE=resend (HTTPS) ou smtp');
  const trustedProxies = (env.TRUSTED_PROXIES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  proxyTrust(trustedProxies);
  const apiPrefix = env.API_PREFIX ?? '';
  if (!/^(?:\/[a-zA-Z0-9_-]+)*$/.test(apiPrefix))
    throw new Error('API_PREFIX inválido; use vazio ou /api');
  const apiOrigin = webUrl(
    env.PUBLIC_API_ORIGIN || env.RENDER_EXTERNAL_URL || origin.origin,
    'PUBLIC_API_ORIGIN'
  );
  if (
    !['http:', 'https:'].includes(apiOrigin.protocol) ||
    apiOrigin.pathname !== '/' ||
    apiOrigin.search ||
    apiOrigin.hash ||
    apiOrigin.username ||
    apiOrigin.password
  )
    throw new Error('PUBLIC_API_ORIGIN deve ser uma origem HTTP(S)');
  if (environment === 'production' && apiOrigin.protocol !== 'https:')
    throw new Error('Produção exige API HTTPS');
  const cookieSameSite = env.COOKIE_SAME_SITE ?? 'lax';
  if (!['lax', 'strict', 'none'].includes(cookieSameSite))
    throw new Error('COOKIE_SAME_SITE inválido');
  if (cookieSameSite === 'none' && apiOrigin.protocol !== 'https:')
    throw new Error('SameSite=None exige API HTTPS');
  let resend: Config['resend'];
  if (mailMode === 'resend') {
    if (
      !env.RESEND_API_KEY ||
      !env.MAIL_FROM ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.MAIL_FROM)
    )
      throw new Error('Configure RESEND_API_KEY e MAIL_FROM verificado no provedor');
    resend = { apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM };
  }
  let smtp: Config['smtp'];
  if (mailMode === 'smtp') {
    const smtpPort = Number(env.SMTP_PORT ?? 587);
    if (
      !env.SMTP_HOST ||
      /[\s/]/.test(env.SMTP_HOST) ||
      ![465, 587].includes(smtpPort) ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD ||
      !env.SMTP_FROM ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.SMTP_FROM)
    )
      throw new Error(
        'Configure SMTP_HOST, SMTP_PORT (465/587), SMTP_USER, SMTP_PASSWORD e SMTP_FROM'
      );
    smtp = {
      host: env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM,
    };
  }
  return {
    environment: environment as Config['environment'],
    host: env.HOST ?? '127.0.0.1',
    port,
    databaseUrl: databaseUrl(env.DATABASE_URL, environment === 'production'),
    origin: origin.origin,
    authKey: env.AUTH_KEY,
    mailMode: mailMode as Config['mailMode'],
    trustedProxies,
    apiPrefix,
    apiOrigin: apiOrigin.origin,
    cookieSameSite: cookieSameSite as NonNullable<Config['cookieSameSite']>,
    ...(resend ? { resend } : {}),
    ...(smtp ? { smtp } : {}),
    mailDirectory: resolve(env.MAIL_DIRECTORY ?? './data/mail'),
  };
}
export function databaseUrl(value: string | undefined, production = false) {
  if (!value) throw new Error('Configure DATABASE_URL do PostgreSQL/Neon');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL inválida');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/')
    throw new Error('DATABASE_URL deve apontar para um banco PostgreSQL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (production || !local) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
