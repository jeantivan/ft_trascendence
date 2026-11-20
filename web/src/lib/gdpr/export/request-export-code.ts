import { issueOtp, type OtpRepository } from "@/lib/gdpr/otp";
import type { MailSender } from "@/lib/mail/mail-sender";

export type RequestExportCodeResult =
  | { sent: true }
  | { sent: false; reason: "cooldown"; retryAfterSeconds: number }
  | { sent: false; reason: "send_failed" };

const SUBJECT = "Código para exportar tus datos de StrideSync";

function bodyFor(code: string): string {
  return [
    "Has solicitado exportar tus datos de StrideSync.",
    "",
    `Tu código es: ${code}`,
    "",
    "Caduca en 10 minutos. Solicitar este código no genera la exportación: tendrás que introducirlo para confirmarla.",
    "",
    "Si no lo has solicitado, no utilices el código.",
  ].join("\n");
}

// Issues an export_data code and emails it to the user. Same contract as
// requestDeleteCode: the caller passes the user from the validated session, the code only
// leaves this function inside the email, and a failed send does not undo the cooldown.
// Errors that are not the mail send (e.g. the database) are not caught.
export async function requestExportCode(
  user: { id: string; email: string },
  repo: OtpRepository,
  mailer: MailSender,
  now: Date = new Date(),
): Promise<RequestExportCodeResult> {
  const issued = await issueOtp(user.id, "export_data", repo, now);
  if (!issued.issued) {
    return { sent: false, reason: "cooldown", retryAfterSeconds: issued.retryAfterSeconds };
  }
  try {
    await mailer.send({ to: user.email, subject: SUBJECT, text: bodyFor(issued.code) });
  } catch {
    return { sent: false, reason: "send_failed" };
  }
  return { sent: true };
}
