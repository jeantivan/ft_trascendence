import nodemailer from "nodemailer";
import type { MailMessage, MailSender } from "./mail-sender";

// The only part of a nodemailer transport used here: tests pass a fake
export interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export class SmtpMailSender implements MailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

// Same shape as process.env: variable name to value
export type SmtpEnv = Record<string, string | undefined>;

// Reads the SMTP settings from the environment. Plain SMTP without TLS or login:
// it is meant for Mailpit inside the Docker network, never for the internet.
export function createSmtpMailSender(env: SmtpEnv = process.env): SmtpMailSender {
  const { SMTP_HOST, SMTP_PORT, MAIL_FROM } = env;
  if (!SMTP_HOST || !SMTP_PORT || !MAIL_FROM) {
    throw new Error("SMTP_HOST, SMTP_PORT and MAIL_FROM must be set to send email");
  }
  // Number() alone would take "abc" (NaN), "0x19" or "25.5"
  const port = /^\d+$/.test(SMTP_PORT) ? Number(SMTP_PORT) : 0;
  if (port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a port number between 1 and 65535");
  }
  return new SmtpMailSender(nodemailer.createTransport({ host: SMTP_HOST, port, secure: false }), MAIL_FROM);
}
