import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  linkSync,
  rmSync,
  appendFileSync,
  openSync,
  readSync,
  closeSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { backupDatabase } from './backup.js';
const magic = Buffer.from('GRIMORIO-PG-ENC-1\n');
function encryptionKey(value: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value))
    throw new Error('BACKUP_ENCRYPTION_KEY deve ter 32 bytes em hexadecimal');
  return Buffer.from(value, 'hex');
}
export async function fileDigest(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { sha256: hash.digest('hex'), bytes: statSync(path).size };
}
export async function encryptArchive(source: string, destination: string, keyValue: string) {
  const key = encryptionKey(keyValue),
    output = resolve(destination);
  if (existsSync(output)) throw new Error('Destino já existe');
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const tmp = mkdtempSync(join(dirname(output), '.encrypted-')),
    file = join(tmp, 'archive');
  try {
    const iv = randomBytes(12),
      header = Buffer.concat([magic, iv]),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(header);
    const stream = createWriteStream(file, { flags: 'wx', mode: 0o600 });
    stream.write(header);
    await pipeline(createReadStream(source), cipher, stream);
    appendFileSync(file, cipher.getAuthTag());
    linkSync(file, output);
    return { path: output, format: 'grimorio-aes-256-gcm-v1', ...(await fileDigest(output)) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
export async function decryptArchive(source: string, destination: string, keyValue: string) {
  const key = encryptionKey(keyValue),
    output = resolve(destination);
  if (existsSync(output)) throw new Error('Destino já existe');
  const size = statSync(source).size,
    header = Buffer.alloc(magic.length + 12),
    tag = Buffer.alloc(16);
  if (size < header.length + 16) throw new Error('Backup criptografado inválido');
  const fd = openSync(source, 'r');
  try {
    readSync(fd, header, 0, header.length, 0);
    readSync(fd, tag, 0, 16, size - 16);
  } finally {
    closeSync(fd);
  }
  if (!header.subarray(0, magic.length).equals(magic))
    throw new Error('Formato criptografado inválido');
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  const tmp = mkdtempSync(join(dirname(output), '.decrypted-')),
    file = join(tmp, 'archive');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(source, { start: header.length, end: size - 17 }),
      decipher,
      createWriteStream(file, { flags: 'wx', mode: 0o600 })
    );
    linkSync(file, output);
    return { path: output, ...(await fileDigest(output)) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
export async function encryptedBackup(connection: string, destination: string, key: string) {
  encryptionKey(key);
  const tmp = mkdtempSync(join(tmpdir(), 'grimorio-export-'));
  try {
    const dump = join(tmp, 'database.dump');
    await backupDatabase(connection, dump);
    return {
      ...(await encryptArchive(dump, destination, key)),
      createdAt: new Date().toISOString(),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
