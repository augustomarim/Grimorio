import { existsSync } from 'node:fs';
import { openDatabase } from './database.js';
import { migrate } from './migrations.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const db = openDatabase(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
try {
  console.info(JSON.stringify({ schemaVersion: await migrate(db) }));
} finally {
  await db.close();
}
