import { asyncSome } from '../db/async-array.js';
import type { Database } from '../db/database.js';
import { AppError } from '../errors.js';
import {
  bucketHash,
  digest,
  emailHash,
  hashPassword,
  normalizeEmail,
  token,
  verifyPassword,
} from './crypto.js';
import type { Mail, Mailer } from './mail.js';
export interface User {
  id: number;
  email: string;
  username: string;
  role: 'user' | 'admin';
  is_active: number;
  email_verified_at: string | null;
  password_hash: string;
}
export interface Credentials {
  access: string;
  refresh: string;
  accessExpires: string;
  familyExpires: string;
  user: ReturnType<typeof publicUser>;
}
export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  role: u.role,
  emailVerified: !!u.email_verified_at,
});
const invalid = () =>
  new AppError(
    401,
    'UNAUTHENTICATED',
    'Credenciais inválidas ou indisponíveis. Tente novamente mais tarde.'
  );
const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();
const minute = 60000,
  day = 24 * 60 * minute;
export class AuthService {
  constructor(
    private db: Database,
    private key: string,
    private dummyHash: string,
    private mailer: Mailer,
    private now = () => new Date()
  ) {}
  private async audit(actor: number | null, action: string, type: string, id: number) {
    await this.db
      .prepare('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)')
      .run(actor, action, type, id);
  }
  private async revoke(sessionId: number, now: string) {
    await this.db
      .prepare('UPDATE session SET revoked_at=COALESCE(revoked_at,?) WHERE id=?')
      .run(now, sessionId);
    await this.db
      .prepare('UPDATE refresh_token SET revoked_at=COALESCE(revoked_at,?) WHERE session_id=?')
      .run(now, sessionId);
  }
  private async revokeUser(userId: number, now: string) {
    await this.db
      .prepare('UPDATE session SET revoked_at=COALESCE(revoked_at,?) WHERE user_id=?')
      .run(now, userId);
    await this.db
      .prepare(
        'UPDATE refresh_token SET revoked_at=COALESCE(revoked_at,?) WHERE session_id IN (SELECT id FROM session WHERE user_id=?)'
      )
      .run(now, userId);
  }
  private async issue(user: User, purpose: Mail['purpose'], now: Date): Promise<Mail> {
    await this.db
      .prepare(
        'UPDATE auth_token SET revoked_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL'
      )
      .run(now.toISOString(), user.id, purpose);
    const raw = token();
    await this.db
      .prepare(
        'INSERT INTO auth_token(user_id,purpose,token_hash,created_at,expires_at,issued_email_hash) VALUES(?,?,?,?,?,?)'
      )
      .run(
        user.id,
        purpose,
        digest(raw),
        now.toISOString(),
        later(now, purpose === 'password_reset' ? 30 * minute : day),
        emailHash(user.email)
      );
    return { to: user.email, purpose, token: raw };
  }
  async register(email: string, username: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password),
      now = this.now();
    const message = await this.db
      .transaction(async () => {
        if (
          await this.db
            .prepare('SELECT 1 FROM app_user WHERE email=? OR username=?')
            .get(normalizeEmail(email), username)
        )
          return null;
        const row = await this.db
          .prepare(
            'INSERT INTO app_user(email,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)'
          )
          .run(normalizeEmail(email), username, passwordHash, now.toISOString(), now.toISOString());
        const user = (await this.db
          .prepare('SELECT * FROM app_user WHERE id=?')
          .get(row.insertId)) as User;
        await this.audit(user.id, 'account.register', 'app_user', user.id);
        return await this.issue(user, 'email_verification', now);
      })
      .immediate();
    if (message) await this.mailer.send(message);
  }
  private async buckets(email: string, ip: string) {
    return [
      {
        scope: 'email',
        hash: bucketHash(this.key, 'email', normalizeEmail(email)),
        limit: 5,
      },
      { scope: 'network', hash: bucketHash(this.key, 'network', ip), limit: 50 },
    ];
  }
  private async blocked(email: string, ip: string, now: string) {
    return await asyncSome(
      await this.buckets(email, ip),
      async (b) =>
        !!(await this.db
          .prepare('SELECT 1 FROM login_throttle WHERE scope=? AND key_hash=? AND blocked_until>?')
          .get(b.scope, b.hash, now))
    );
  }
  private async failure(email: string, ip: string, now: Date) {
    for (const b of await this.buckets(email, ip)) {
      const row = (await this.db
        .prepare(
          'SELECT window_started_at,failure_count FROM login_throttle WHERE scope=? AND key_hash=?'
        )
        .get(b.scope, b.hash)) as
        | {
            window_started_at: string;
            failure_count: number;
          }
        | undefined;
      const fresh = !row || row.window_started_at <= later(now, -15 * minute),
        count = fresh ? 1 : row.failure_count + 1;
      await this.db
        .prepare(
          `INSERT INTO login_throttle(scope,key_hash,window_started_at,failure_count,blocked_until,expires_at,updated_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(scope,key_hash) DO UPDATE SET window_started_at=excluded.window_started_at,failure_count=excluded.failure_count,blocked_until=excluded.blocked_until,expires_at=excluded.expires_at,updated_at=excluded.updated_at`
        )
        .run(
          b.scope,
          b.hash,
          fresh ? now.toISOString() : row.window_started_at,
          count,
          count >= b.limit ? later(now, 15 * minute) : null,
          later(now, day),
          now.toISOString()
        );
    }
  }
  private async createSession(
    user: User,
    ip: string,
    userAgent: string,
    now: Date
  ): Promise<Credentials> {
    const access = token(),
      refresh = token(),
      accessExpires = later(now, 15 * minute),
      familyExpires = later(now, 30 * day);
    const row = await this.db
      .prepare(
        'INSERT INTO session(user_id,token_hash,created_at,expires_at,ip_address,user_agent,access_expires_at) VALUES(?,?,?,?,?,?,?)'
      )
      .run(
        user.id,
        digest(access),
        now.toISOString(),
        familyExpires,
        ip,
        userAgent.slice(0, 512),
        accessExpires
      );
    await this.db
      .prepare(
        'INSERT INTO refresh_token(session_id,token_hash,created_at,expires_at) VALUES(?,?,?,?)'
      )
      .run(row.insertId, digest(refresh), now.toISOString(), familyExpires);
    await this.db
      .prepare('UPDATE app_user SET last_login_at=? WHERE id=?')
      .run(now.toISOString(), user.id);
    await this.audit(user.id, 'session.login', 'session', Number(row.insertId));
    return { access, refresh, accessExpires, familyExpires, user: publicUser(user) };
  }
  async login(
    email: string,
    password: string,
    ip: string,
    userAgent: string
  ): Promise<Credentials> {
    if (await this.blocked(email, ip, this.now().toISOString())) throw invalid();
    const user = (await this.db
      .prepare('SELECT * FROM app_user WHERE email=?')
      .get(normalizeEmail(email))) as User | undefined;
    const usable = !!user?.password_hash.startsWith('$argon2id$');
    const valid = await verifyPassword(usable ? user!.password_hash : this.dummyHash, password);
    const result = await this.db
      .transaction(async () => {
        const now = this.now();
        await this.db
          .prepare('DELETE FROM login_throttle WHERE expires_at<=?')
          .run(now.toISOString());
        if (await this.blocked(email, ip, now.toISOString())) return null;
        const current = user
          ? ((await this.db.prepare('SELECT * FROM app_user WHERE id=?').get(user.id)) as
              User | undefined)
          : undefined;
        if (
          !current ||
          !usable ||
          !valid ||
          !current.is_active ||
          current.password_hash !== user!.password_hash
        ) {
          await this.failure(email, ip, now);
          return null;
        }
        await this.db
          .prepare("DELETE FROM login_throttle WHERE scope='email' AND key_hash=?")
          .run(bucketHash(this.key, 'email', normalizeEmail(email)));
        return await this.createSession(current, ip, userAgent, now);
      })
      .immediate();
    if (!result) throw invalid();
    return result;
  }
  async authenticate(access: string | undefined): Promise<User> {
    if (!access) throw invalid();
    const now = this.now().toISOString();
    const user = (await this.db
      .prepare(
        'SELECT u.* FROM session s JOIN app_user u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND u.is_active=1 AND s.access_expires_at>? AND s.expires_at>?'
      )
      .get(digest(access), now, now)) as User | undefined;
    if (!user) throw invalid();
    return user;
  }
  async refresh(raw: string | undefined): Promise<Credentials> {
    if (!raw) throw invalid();
    const result = await this.db
      .transaction(async () => {
        const now = this.now(),
          time = now.toISOString();
        const row = (await this.db
          .prepare(
            `SELECT r.*,s.revoked_at AS family_revoked,s.expires_at AS family_expires,s.user_id FROM refresh_token r JOIN session s ON s.id=r.session_id WHERE r.token_hash=?`
          )
          .get(digest(raw))) as
          | {
              id: number;
              session_id: number;
              used_at: string | null;
              revoked_at: string | null;
              expires_at: string;
              family_revoked: string | null;
              family_expires: string;
              user_id: number;
            }
          | undefined;
        if (!row) throw invalid();
        if (row.used_at) {
          await this.revoke(row.session_id, time);
          await this.audit(row.user_id, 'session.refresh_reuse', 'session', row.session_id);
          return null;
        }
        const user = (await this.db
          .prepare('SELECT * FROM app_user WHERE id=?')
          .get(row.user_id)) as User;
        if (
          row.revoked_at ||
          row.family_revoked ||
          !user.is_active ||
          row.expires_at <= time ||
          row.family_expires <= time
        )
          throw invalid();
        if (
          (
            await this.db
              .prepare(
                'UPDATE refresh_token SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL'
              )
              .run(time, row.id)
          ).changes !== 1
        )
          throw invalid();
        const access = token(),
          refresh = token(),
          accessExpires = [later(now, 15 * minute), row.family_expires].sort()[0]!;
        await this.db
          .prepare(
            'INSERT INTO refresh_token(session_id,token_hash,parent_token_id,created_at,expires_at) VALUES(?,?,?,?,?)'
          )
          .run(row.session_id, digest(refresh), row.id, time, row.family_expires);
        await this.db
          .prepare('UPDATE session SET token_hash=?,access_expires_at=? WHERE id=?')
          .run(digest(access), accessExpires, row.session_id);
        return {
          access,
          refresh,
          accessExpires,
          familyExpires: row.family_expires,
          user: publicUser(user),
        };
      })
      .immediate();
    if (!result) throw invalid();
    return result;
  }
  async logout(access: string | undefined, refresh: string | undefined) {
    await this.db
      .transaction(async () => {
        const row = refresh
          ? ((await this.db
              .prepare('SELECT session_id AS id FROM refresh_token WHERE token_hash=?')
              .get(digest(refresh))) as
              | {
                  id: number;
                }
              | undefined)
          : undefined;
        const accessRow = access
          ? ((await this.db
              .prepare('SELECT id FROM session WHERE token_hash=?')
              .get(digest(access))) as
              | {
                  id: number;
                }
              | undefined)
          : undefined;
        const ids = new Set([row?.id, accessRow?.id]);
        for (const id of ids) if (id) await this.revoke(id, this.now().toISOString());
      })
      .immediate();
  }
  async logoutAll(user: User) {
    await this.db
      .transaction(async () => {
        await this.revokeUser(user.id, this.now().toISOString());
        await this.audit(user.id, 'session.logout_all', 'app_user', user.id);
      })
      .immediate();
  }
  async requestToken(email: string, purpose: Mail['purpose']) {
    const message = await this.db
      .transaction(async () => {
        const user = (await this.db
          .prepare('SELECT * FROM app_user WHERE email=?')
          .get(normalizeEmail(email))) as User | undefined;
        if (!user?.is_active || (purpose === 'email_verification' && user.email_verified_at))
          return null;
        return await this.issue(user, purpose, this.now());
      })
      .immediate();
    if (message) await this.mailer.send(message);
  }
  async consume(raw: string, purpose: Mail['purpose'], password?: string) {
    const newHash = purpose === 'password_reset' ? await hashPassword(password!) : undefined;
    await this.db
      .transaction(async () => {
        const time = this.now().toISOString();
        const row = (await this.db
          .prepare(
            'SELECT * FROM auth_token WHERE token_hash=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?'
          )
          .get(digest(raw), purpose, time)) as
          | {
              id: number;
              user_id: number;
              issued_email_hash: string;
            }
          | undefined;
        const user = row
          ? ((await this.db.prepare('SELECT * FROM app_user WHERE id=?').get(row.user_id)) as
              User | undefined)
          : undefined;
        if (!row || !user?.is_active || row.issued_email_hash !== emailHash(user.email))
          throw new AppError(400, 'INVALID_TOKEN', 'Token inválido ou expirado');
        if (
          (
            await this.db
              .prepare(
                'UPDATE auth_token SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL'
              )
              .run(time, row.id)
          ).changes !== 1
        )
          throw new AppError(400, 'INVALID_TOKEN', 'Token inválido ou expirado');
        if (purpose === 'email_verification')
          await this.db
            .prepare('UPDATE app_user SET email_verified_at=?,updated_at=? WHERE id=?')
            .run(time, time, user.id);
        else {
          await this.db
            .prepare('UPDATE app_user SET password_hash=?,updated_at=? WHERE id=?')
            .run(newHash!, time, user.id);
          await this.revokeUser(user.id, time);
          await this.db
            .prepare(
              "UPDATE auth_token SET revoked_at=? WHERE user_id=? AND purpose='password_reset' AND used_at IS NULL AND revoked_at IS NULL"
            )
            .run(time, user.id);
        }
        await this.audit(user.id, `account.${purpose}`, 'app_user', user.id);
      })
      .immediate();
  }
}
