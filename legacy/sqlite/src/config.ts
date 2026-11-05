import { isIP } from 'node:net';
import { resolve } from 'node:path';

export interface Config {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databasePath: string;
  origin: string;
  authKey: string;
  mailMode: 'disabled' | 'file' | 'smtp';
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
export function loadConfig(env = process.env): Config {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment))
    throw new Error('NODE_ENV inválido');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválida');
  const origin = new URL(env.APP_ORIGIN ?? 'http://localhost:3000');
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
  if (!['disabled', 'file', 'smtp'].includes(mailMode)) throw new Error('MAIL_MODE inválido');
  if (environment === 'production' && mailMode !== 'smtp')
    throw new Error('Produção exige MAIL_MODE=smtp');
  const trustedProxies = (env.TRUSTED_PROXIES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (trustedProxies.some((s) => !isIP(s)))
    throw new Error('TRUSTED_PROXIES aceita somente IPs explícitos separados por vírgula');
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
    databasePath: resolve(env.DATABASE_PATH ?? './data/grimorio.db'),
    origin: origin.origin,
    authKey: env.AUTH_KEY,
    mailMode: mailMode as Config['mailMode'],
    trustedProxies,
    ...(smtp ? { smtp } : {}),
    mailDirectory: resolve(env.MAIL_DIRECTORY ?? './data/mail'),
  };
}
