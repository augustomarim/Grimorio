import { existsSync } from 'node:fs';
import { backupDatabase, restoreDatabase, inspectBackup } from './backup.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const [command, first, second, ...extra] = process.argv.slice(2);
try {
  if (
    extra.length ||
    !first ||
    !['backup', 'restore', 'verify'].includes(command ?? '') ||
    (command === 'restore' && !second) ||
    ((command === 'verify' || command === 'backup') && second)
  )
    throw new Error(
      'Uso: backup <novo-arquivo> | verify <arquivo> | restore <backup> <novo-banco>'
    );
  const result =
    command === 'verify'
      ? inspectBackup(first)
      : command === 'restore'
        ? await restoreDatabase(first, second!)
        : await backupDatabase(process.env.DATABASE_PATH ?? './data/grimorio.db', first);
  console.info(JSON.stringify({ operation: command, ...result }));
} catch {
  console.error(
    'Operação não concluída. Confira argumentos, permissões, integridade e se o destino é novo. Nenhum destino existente é substituído.'
  );
  process.exitCode = 1;
}
