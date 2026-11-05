import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { verifyOtpWithoutConsuming } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";

export const CLUB_WITHOUT_MANAGER = "club_without_manager";

export type DeleteAccountResult = { deleted: true } | { deleted: false; reason: "invalid_code" };

// Thrown inside the transaction when the code could not be consumed; caught
// below and returned as invalid_code. Any other error is rethrown unchanged.
class OtpNotConsumedError extends Error {}

// Single public entry to delete an account. userId must come from the validated
// session, never from the request.
//
// 1. Outside the transaction: the code is checked and an attempt is reserved
//    (slow hash, and the attempt must stay spent even if what follows fails).
// 2. Inside one READ COMMITTED transaction: the code is consumed FIRST, then
//    the notices and the deletion. If anything fails, everything rolls back,
//    including the consumption; the reserved attempt stays.
//
// Expiry is checked when the code is consumed, with a fresh new Date() taken
// there (the repository checks it against the now it receives), not with the
// time of step 1. Two requests with the same code: only one consumes it.
export async function deleteAccountWithOtp(
  userId: string,
  code: string,
  db: PrismaClient = prisma,
): Promise<DeleteAccountResult> {
  const verified = await verifyOtpWithoutConsuming(userId, "delete_account", code, new PrismaOtpRepository(db));
  if (!verified.success) return { deleted: false, reason: "invalid_code" };

  try {
    await db.$transaction(
      async (tx) => {
        const consumed = await new PrismaOtpRepository(tx).consumeIfUnusedFor(
          verified.recordId,
          userId,
          "delete_account",
          new Date(),
        );
        if (!consumed) throw new OtpNotConsumedError();
        await deleteAccountRows(userId, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (error instanceof OtpNotConsumedError) return { deleted: false, reason: "invalid_code" };
    throw error;
  }
  return { deleted: true };
}

// Deletes the user row; Postgres removes or detaches the rest through the
// onDelete rules (docs/gdpr/account-deletion-table.md). If the user is the only
// Manager of a club, every remaining Admin gets a notification (the deletion is
// never blocked). Private: it must only run after the code has been consumed in
// the same transaction.
//
// Two Managers of the same club may delete their accounts at the same time. To
// stop both from seeing the other one and nobody warning the Admin, the clubs are
// locked (by id, to acquire club locks in a consistent order) before the other
// Managers are counted. The second transaction waits for the first one's commit
// and then counts again, so it sees the real state.
//
// Known limit, pending the Manager management ticket: this only serializes
// deletions with each other. An Admin granting or removing a Manager at the same
// time is not covered unless that flow locks the club row the same way.
async function deleteAccountRows(userId: string, tx: Prisma.TransactionClient): Promise<void> {
  const managed = await tx.membership.findMany({
    where: { userId, role: "manager" },
    select: { orgId: true },
  });
  const orgIds = managed.map((membership) => membership.orgId);

  if (orgIds.length > 0) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ANY(${orgIds}::uuid[]) ORDER BY id FOR UPDATE`;

    // Counted after the lock, in a new statement, so it sees what the other transaction committed
    const withoutManager: string[] = [];
    for (const orgId of orgIds) {
      const others = await tx.membership.count({
        where: { orgId, role: "manager", userId: { not: userId } },
      });
      if (others === 0) withoutManager.push(orgId);
    }

    if (withoutManager.length > 0) {
      const admins = await tx.user.findMany({
        where: { roleGlobal: "admin", id: { not: userId } },
        select: { id: true },
      });
      // The payload carries only the club id (ADR 0001)
      await tx.notification.createMany({
        data: admins.flatMap((admin) =>
          withoutManager.map((orgId) => ({
            userId: admin.id,
            type: CLUB_WITHOUT_MANAGER,
            payload: { orgId },
          })),
        ),
      });
    }
  }

  await tx.user.delete({ where: { id: userId } });
}
