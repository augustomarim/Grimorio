/** Um comando multiplataforma; preserva falhas e remove relatório antigo. */
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Execute pelo npm: npm.cmd run verify (Windows) ou npm run verify.');
await rm(resolve('reports/smoke.json'), { force: true });
const commands = [
  ['Tipos', [npmCli, 'run', 'typecheck']],
  ['Compilação', [npmCli, 'run', 'build']],
  ['Testes do backend', [npmCli, 'test']],
  ['Fluxo HTTP completo', [resolve('scripts/smoke.mjs')]],
];
for (const [label, args] of commands) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(`Não foi possível iniciar a etapa: ${result.error.message}`);
    process.exitCode = result.status || 1;
    break;
  }
}
if (!process.exitCode)
  console.log(
    '\nVerificação concluída com sucesso. Nenhum dado pessoal de desenvolvimento foi usado.'
  );
