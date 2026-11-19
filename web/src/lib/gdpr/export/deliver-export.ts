import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { generateExport } from "@/lib/gdpr/export/generate-export";
import type { MailSender } from "@/lib/mail/mail-sender";
import { createSmtpMailSender } from "@/lib/mail/smtp-mail-sender";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

const SUBJECT = "Tu exportación de datos de StrideSync está lista";

// Minimal text: the link and when it expires, no data. #169 replaces it with the final text
function bodyFor(link: string, expiresAt: Date): string {
  return [
    "Tu exportación de datos de StrideSync está lista.",
    "",
    `Descárgala con tu sesión iniciada: ${link}`,
    "",
    `El enlace caduca el ${expiresAt.toISOString().slice(0, 10)} (UTC).`,
  ].join("\n");
}

// Fills a pending export and emails the user the download link (#165). Never throws, because
// it runs after the 202 response (after()) and nobody could catch it. Returns whether the
// link was sent.
//
// The token exists only here: generateExport hands it back once and the database keeps its
// hash. So if the email cannot be sent nobody could ever download the ZIP: the export is
// marked failed (the user can ask again) and the ZIP is removed.
//
// deliveredAt is set once the email is sent. If the process dies between ready and that mark,
// cleanupInterruptedExports fails the export at the next start (nobody has the token), so the
// user is not blocked by an active export for 7 days. Known limit: dying right after the email
// went out but before the mark also fails it, and the link stops working; the user asks again.
//
// Known limit: if the cleanup above also fails (database or disk down), the export stays ready with a
// token nobody received and its ZIP on disk. Nobody can download it without the token, and it
// expires after 7 days; nothing removes the ZIP before that.
//
// origin is where the user reaches the app (https://host:port), without a trailing slash.
export async function deliverExport(
  exportId: string,
  origin: string,
  createMailer: () => MailSender = createSmtpMailSender,
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
  now: Date = new Date(),
): Promise<boolean> {
  const generated = await generateExport(exportId, db, uploadsDir, now);
  if (!generated.ready) return false;

  try {
    const row = await db.dataExport.findUniqueOrThrow({
      where: { id: exportId },
      select: { expiresAt: true, user: { select: { email: true } } },
    });
    if (row.expiresAt === null) throw new Error("ready export without expiry");
    const link = `${origin}/api/gdpr/export/${exportId}/download?token=${generated.token}`;
    await createMailer().send({ to: row.user.email, subject: SUBJECT, text: bodyFor(link, row.expiresAt) });
    // The email is out: a failure here must not undo the export. Without the mark the next
    // start would treat it as undelivered (cleanupInterruptedExports) and fail it
    await db.dataExport
      .updateMany({ where: { id: exportId, status: "ready" }, data: { deliveredAt: new Date() } })
      .catch(() => console.warn(`Export ${exportId} was sent but could not be marked delivered`));
    return true;
  } catch (error) {
    // Only the error name: the message could carry the address or the link
    console.warn(`Export ${exportId} email failed (${error instanceof Error ? error.name : "unknown"})`);
    await db.dataExport
      .updateMany({
        where: { id: exportId, status: "ready" },
        data: { status: "failed", tokenHash: null, path: null, expiresAt: null },
      })
      .catch(() => {});
    await rm(path.join(uploadsDir, `exports/${exportId}.zip`), { force: true }).catch(() => {});
    return false;
  }
}
