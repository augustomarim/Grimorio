import { loadProjectEnv } from '../load-env.js';
import { openDatabase } from './database.js';
import { migrate } from './migrations.js';
loadProjectEnv();
const db = openDatabase(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
try {
  console.info(JSON.stringify({ schemaVersion: await migrate(db) }));
} finally {
  await db.close();
}
