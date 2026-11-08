import { existsSync } from 'node:fs';
import { encryptedBackup, decryptArchive } from './backup-encryption.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const [operation, source, destination, ...extra] = process.argv.slice(2);
try {
  const key = process.env.BACKUP_ENCRYPTION_KEY ?? '';
  if (
    extra.length ||
    !source ||
    !['export', 'decrypt'].includes(operation ?? '') ||
    (operation === 'export' && destination) ||
    (operation === 'decrypt' && !destination)
  )
    throw new Error('Argumentos inválidos');
  const result =
    operation === 'export'
      ? await encryptedBackup(
          process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
          source,
          key
        )
      : await decryptArchive(source, destination!, key);
  console.info(JSON.stringify(result));
} catch {
  console.error(
    'Backup criptografado não concluído. Confira argumentos, destino novo, chave de 64 caracteres hexadecimais e conexão. Nenhuma chave ou URL é exibida.'
  );
  process.exitCode = 1;
}
