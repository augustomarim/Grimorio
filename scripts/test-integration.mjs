/** Refuse a successful-looking verification with PostgreSQL tests skipped. */
import { spawnSync } from 'node:child_process';
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    'Configure TEST_DATABASE_URL com um PostgreSQL exclusivo de testes. Nenhuma conexão foi tentada.'
  );
  process.exit(1);
}
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Execute com npm run test:integration.');
const result = spawnSync(process.execPath, [npmCli, 'test', '--workspace', 'backend'], {
  stdio: 'inherit',
  env: process.env,
  cwd: new URL('..', import.meta.url),
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
