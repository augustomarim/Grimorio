import { existsSync } from 'node:fs';
import { openDatabase } from '../db/database.js';
import { migrate } from '../db/migrations.js';
import { normalizeEmail } from './crypto.js';
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) process.loadEnvFile('.env');
const email = process.argv[2];
if (!email) throw new Error('Uso: npm run admin:promote -- email-da-conta-existente');
const db = openDatabase(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '');
try {
  await migrate(db);
  const user = await db
    .transaction(async () => {
      const account = (await db
        .prepare('SELECT id,is_active FROM app_user WHERE email=?')
        .get(normalizeEmail(email))) as
        | {
            id: number;
            is_active: number;
          }
        | undefined;
      if (!account?.is_active)
        throw new Error('Conta ativa não encontrada; cadastre a conta antes');
      await db
        .prepare("UPDATE app_user SET role='admin',updated_at=? WHERE id=?")
        .run(new Date().toISOString(), account.id);
      await db
        .prepare(
          "INSERT INTO audit_log(action,entity_type,entity_id,details) VALUES('account.promote_admin','app_user',?,'{\"origin\":\"local_cli\"}')"
        )
        .run(account.id);
      return { userId: account.id, role: 'admin' };
    })
    .immediate();
  console.info(JSON.stringify(user));
} finally {
  await db.close();
}
