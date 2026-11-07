import { issueOtp, type OtpRepository } from "@/lib/gdpr/otp";
import type { MailSender } from "@/lib/mail/mail-sender";

export type RequestDeleteCodeResult =
  | { sent: true }
  | { sent: false; reason: "cooldown"; retryAfterSeconds: number }
  | { sent: false; reason: "send_failed" };

const SUBJECT = "Código para borrar tu cuenta de StrideSync";

function bodyFor(code: string): string {
  return [
    "Has solicitado borrar tu cuenta de StrideSync.",
    "",
    `Tu código de confirmación es: ${code}`,
    "",
    "Caduca en 10 minutos. Solicitar este código no borra tu cuenta: tendrás que introducirlo y confirmar el borrado.",
    "",
    "Si no lo has solicitado, no utilices el código.",
  ].join("\n");
}

// Issues a delete_account code and emails it to the user. The caller passes the
// user from the validated session: the recipient is never taken from a request.
//
// The code only leaves this function inside the email. It is not in the result
// and nothing is logged here, not even when the send fails.
//
// A failed send does not undo the code: issueOtp has already stored it, so the
// cooldown still runs and the user must wait before asking again. Errors that are
// not the mail send (e.g. the database) are not caught: they must not look like a result.
export async function requestDeleteCode(
  user: { id: string; email: string },
  repo: OtpRepository,
  mailer: MailSender,
  now: Date = new Date(),
): Promise<RequestDeleteCodeResult> {
  const issued = await issueOtp(user.id, "delete_account", repo, now);
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
