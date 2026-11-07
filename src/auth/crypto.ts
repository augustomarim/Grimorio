import { createHash, createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';
import argon2 from 'argon2';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const emailHash = (value: string) => digest(normalizeEmail(value));
export const bucketHash = (secret: string, scope: string, value: string) =>
  createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
// Two Argon2 workers keep 64 MiB hashes from exhausting a small instance.
let active = 0;
const waiting: (() => void)[] = [];
async function passwordWork<T>(operation: () => Promise<T>): Promise<T> {
  if (active < 2 && waiting.length === 0) active++;
  else {
    if (waiting.length >= 16)
      throw new AppError(503, 'AUTH_BUSY', 'Autenticação ocupada. Tente novamente em instantes.');
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  try {
    return await operation();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export const hashPassword = (password: string) =>
  passwordWork(() =>
    argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })
  );
export const verifyPassword = (hash: string, password: string) =>
  passwordWork(async () => {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  });
