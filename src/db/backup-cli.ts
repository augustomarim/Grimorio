import { existsSync } from 'node:fs';
import { backupDatabase, restoreDatabase, inspectBackup } from './backup.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const [operation, file, ...extra] = process.argv.slice(2);
try {
  if (!file || extra.length || !['backup', 'restore', 'verify'].includes(operation ?? ''))
    throw new Error('Uso: backup|verify|restore <arquivo>');
  if (operation === 'restore' && !process.env.RESTORE_DATABASE_URL)
    throw new Error('Configure RESTORE_DATABASE_URL apontando para um banco vazio');
  const result =
    operation === 'verify'
      ? await inspectBackup(file)
      : operation === 'restore'
        ? await restoreDatabase(file, process.env.RESTORE_DATABASE_URL!)
        : await backupDatabase(
            process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
            file
          );
  console.info(JSON.stringify({ operation, ...result }));
} catch {
  console.error(
    'Operação cancelada. Confira arquivo, conexão, utilitários PostgreSQL 17 e destino de restauração vazio. Nenhuma URL ou credencial é exibida.'
  );
  process.exitCode = 1;
}
