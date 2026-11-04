import { resolve } from 'node:path';

export interface Config {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databasePath: string;
  origin: string;
  authKey: string;
  mailMode: 'disabled' | 'file';
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
  if (!['disabled', 'file'].includes(mailMode)) throw new Error('MAIL_MODE inválido');
  if (environment === 'production' && mailMode === 'file')
    throw new Error('MAIL_MODE=file é exclusivo de desenvolvimento');
  return {
    environment: environment as Config['environment'],
    host: env.HOST ?? '127.0.0.1',
    port,
    databasePath: resolve(env.DATABASE_PATH ?? './data/grimorio.db'),
    origin: origin.origin,
    authKey: env.AUTH_KEY,
    mailMode: mailMode as Config['mailMode'],
    mailDirectory: resolve(env.MAIL_DIRECTORY ?? './data/mail'),
  };
}
