import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { verifyOtpWithoutConsuming } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";

export type RequestExportResult =
  | { requested: true; exportId: string }
  | { requested: false; reason: "invalid_code" | "already_active" };

// Thrown inside the transaction when the code could not be consumed; caught
// below and returned as invalid_code. Any other error is rethrown unchanged.
class OtpNotConsumedError extends Error {}
// Thrown for the same reason when the user already has an active export. It rolls
// back the whole transaction, so the code stays unused for a later request.
class ActiveExportError extends Error {}

// A pending export older than this has lost its generator (crash, restart): it
// no longer blocks a new request. Generating a ZIP takes seconds.
export const STUCK_PENDING_MS = 15 * 60 * 1000;

// Creates a pending export after checking the export_data code. userId must come
// from the validated session, never from the request. Same two steps as
// deleteAccountWithOtp: the attempt is reserved outside the transaction, and the
// code is consumed first inside it, so a failure rolls the consumption back.
export async function requestExport(
  userId: string,
  code: string,
  db: PrismaClient = prisma,
): Promise<RequestExportResult> {
  const verified = await verifyOtpWithoutConsuming(userId, "export_data", code, new PrismaOtpRepository(db));
  if (!verified.success) return { requested: false, reason: "invalid_code" };

  try {
    const exportId = await db.$transaction(
      async (tx) => {
        // Serializes two requests of the same user: the second waits here for the
        // first one's commit and then sees its pending row. NO KEY UPDATE, not UPDATE:
        // it does not block the foreign key checks of other tables pointing at the user
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
        const now = new Date();
        // Old failed rows, and pending ones whose generator is gone, are replaced by the new request.
        // A generator that is still alive finds its row missing and must not recreate it
        await tx.dataExport.deleteMany({
          where: {
            userId,
            OR: [{ status: "failed" }, { status: "pending", createdAt: { lt: new Date(now.getTime() - STUCK_PENDING_MS) } }],
          },
        });
        // Active = being generated, or ready and not expired. A failed export is not active
        const active = await tx.dataExport.findFirst({
          where: { userId, OR: [{ status: "pending" }, { status: "ready", expiresAt: { gt: now } }] },
          select: { id: true },
        });
        if (active) throw new ActiveExportError();
        const consumed = await new PrismaOtpRepository(tx).consumeIfUnusedFor(
          verified.recordId,
          userId,
          "export_data",
          now,
        );
        if (!consumed) throw new OtpNotConsumedError();
        const created = await tx.dataExport.create({ data: { userId }, select: { id: true } });
        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    return { requested: true, exportId };
  } catch (error) {
    if (error instanceof ActiveExportError) return { requested: false, reason: "already_active" };
    if (error instanceof OtpNotConsumedError) return { requested: false, reason: "invalid_code" };
    throw error;
  }
}
