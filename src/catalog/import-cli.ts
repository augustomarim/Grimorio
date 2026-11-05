import { existsSync } from 'node:fs';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { importCatalog } from './import.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const db = openDatabase(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
try {
  await migrate(db);
  console.info(JSON.stringify(await importCatalog(db), null, 2));
} finally {
  await db.close();
}
