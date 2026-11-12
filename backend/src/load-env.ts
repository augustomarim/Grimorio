import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadProjectEnv() {
  const envFile = [new URL('../.env', import.meta.url), new URL('../../.env', import.meta.url)]
    .find((file) => existsSync(file));
  if (envFile) process.loadEnvFile(fileURLToPath(envFile));
}
