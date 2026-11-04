import { createHash, createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const emailHash = (value: string) => digest(normalizeEmail(value));
export const bucketHash = (secret: string, scope: string, value: string) =>
  createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
