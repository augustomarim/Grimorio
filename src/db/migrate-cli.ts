import { existsSync } from 'node:fs';
import { openDatabase } from './database.js';
import { migrate } from './migrations.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const db = openDatabase(process.env.DATABASE_PATH ?? './data/grimorio.db');
try {
  console.info(JSON.stringify({ schemaVersion: migrate(db) }));
} finally {
  db.close();
}
