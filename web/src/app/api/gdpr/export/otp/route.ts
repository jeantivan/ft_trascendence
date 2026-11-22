import { requestExportCode } from "@/lib/gdpr/export/request-export-code";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";
import { createSmtpMailSender } from "@/lib/mail/smtp-mail-sender";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { prisma } from "@/lib/prisma";

// POST /api/gdpr/export/otp: emails the signed-in user the code that confirms a data
// export (#165). No body: the recipient is the session user's email, so a request cannot
// send the code anywhere else.
export async function POST(): Promise<Response> {
  const user = await requireApiAuth();
  if (user instanceof Response) {
    return user;
  }

  let mailer;
  try {
    mailer = createSmtpMailSender();
  } catch {
    // Missing or invalid SMTP settings: nothing was issued, so no cooldown runs
    return Response.json({ error: "The code could not be sent" }, { status: 503 });
  }

  const result = await requestExportCode({ id: user.id, email: user.email }, new PrismaOtpRepository(prisma), mailer);
  if (result.sent) {
    return new Response(null, { status: 204 });
  }
  if (result.reason === "cooldown") {
    return Response.json(
      { error: "A code was sent a moment ago" },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  // The cooldown already runs for the code that was issued
  return Response.json({ error: "The code could not be sent" }, { status: 503, headers: { "Retry-After": "60" } });
}
