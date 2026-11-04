import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export interface Mail {
  to: string;
  purpose: 'email_verification' | 'password_reset';
  token: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}
export class DisabledMailer implements Mailer {
  async send(_mail: Mail): Promise<void> {
    /* Desenvolvimento explícito sem entrega. */
  }
}
export class FileMailer implements Mailer {
  constructor(private directory: string) {}
  async send(mail: Mail): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(this.directory, `${randomUUID()}.json`),
      JSON.stringify({ ...mail, developmentOnly: true }, null, 2),
      { mode: 0o600, flag: 'wx' }
    );
  }
}
