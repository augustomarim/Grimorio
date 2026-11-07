import nodemailer from 'nodemailer';
import type { Config } from '../config.js';
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
export function mailContent(mail: Mail, origin: string) {
  const reset = mail.purpose === 'password_reset';
  const link = new URL(reset ? '/reset-password' : '/verify-email', origin);
  link.hash = new URLSearchParams({ token: mail.token }).toString();
  return {
    to: mail.to,
    subject: reset ? 'Grimorio — redefinir senha' : 'Grimorio — confirmar e-mail',
    text: `${reset ? 'Para redefinir sua senha' : 'Para confirmar seu e-mail'}, abra:\n${link.toString()}\n\nSe você não solicitou esta ação, ignore esta mensagem.`,
  };
}
export class SmtpMailer implements Mailer {
  private transport;
  constructor(
    private settings: NonNullable<Config['smtp']>,
    private origin: string
  ) {
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: { user: settings.user, pass: settings.password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { minVersion: 'TLSv1.2' },
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  }
  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.settings.from, ...mailContent(mail, this.origin) });
  }
}

// Transactional e-mail over HTTPS; unrelated to OAuth or Google sign-in.
export class ResendMailer implements Mailer {
  constructor(
    private settings: NonNullable<Config['resend']>,
    private origin: string
  ) {}
  async send(mail: Mail) {
    const content = mailContent(mail, this.origin);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.settings.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.settings.from,
        to: [content.to],
        subject: content.subject,
        text: content.text,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    // Never surface a provider response body, which may contain private recipient details.
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Falha na entrega de e-mail por HTTPS');
    }
    await response.body?.cancel();
  }
}
