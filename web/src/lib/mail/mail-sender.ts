// What the app needs to send an email. Callers depend on this, not on SMTP,
// so tests can use a fake and the transport can change without touching them.
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailSender {
  // Rejects if the message could not be handed to the mail server
  send(message: MailMessage): Promise<void>;
}
