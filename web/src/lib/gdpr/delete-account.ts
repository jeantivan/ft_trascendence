import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { verifyOtpWithoutConsuming } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";
import { deleteAvatarFiles } from "@/lib/uploads/delete-avatar-files";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

export const CLUB_WITHOUT_MANAGER = "club_without_manager";

export type DeleteAccountResult =
  // avatarCleanupFailed is only present when some avatar file could not be removed
  | { deleted: true; avatarCleanupFailed?: number }
  | { deleted: false; reason: "invalid_code" };

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
//
// 3. After the commit: the avatar files are deleted from uploadsDir. The paths are
//    read inside the transaction, before the user row goes, because the cascade
//    removes the Avatar rows and without them nobody knows which files to delete.
//    If the code is rejected or the transaction fails, the disk is never touched.
//    A file that cannot be deleted does not undo the deletion: the result stays
//    deleted: true (the session must be closed) and carries avatarCleanupFailed.
export async function deleteAccountWithOtp(
  userId: string,
  code: string,
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
): Promise<DeleteAccountResult> {
  const verified = await verifyOtpWithoutConsuming(userId, "delete_account", code, new PrismaOtpRepository(db));
  if (!verified.success) return { deleted: false, reason: "invalid_code" };

  let avatarPaths: string[] = [];
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
        // Written before the rest on purpose: if anything below fails, this row rolls back too.
        // Ids only, no email, nick or code. No foreign key: the row outlives the user (12 months)
        await tx.auditLog.create({
          data: { actorId: userId, subjectId: userId, actorRole: null, action: "account_deleted", resource: "account" },
        });
        const avatars = await tx.avatar.findMany({ where: { ownerId: userId }, select: { path: true } });
        avatarPaths = avatars.map((avatar) => avatar.path);
        await deleteAccountRows(userId, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (error instanceof OtpNotConsumedError) return { deleted: false, reason: "invalid_code" };
    throw error;
  }

  // Committed: the account is gone. A disk failure must not look like it still exists
  const failed = await deleteAvatarFiles(avatarPaths, uploadsDir);
  if (failed === 0) return { deleted: true };
  // Only the count: no paths, email, code or error
  console.warn(`Account deleted, but ${failed} avatar file(s) could not be removed`);
  return { deleted: true, avatarCleanupFailed: failed };
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

  await deleteDirectMessagesLeftEmpty(userId, tx);

  await tx.user.delete({ where: { id: userId } });
}

// A DM is kept for the other Contact while their account exists; when the last
// account in it is deleted, the conversation and its messages go too
// (docs/gdpr/account-deletion-table.md). Event chats are never touched here.
//
// PROVISIONAL, pending Jacobo's answer in #34: every participant row still linked to
// an existing account counts as "the other person is still here", including rows
// with removed_at. Do not read this as the decision on what removed_at means.
//
// Two people deleting the same DM at the same time: without a lock each one still
// sees the other one's row, so nobody deletes the conversation and it is left empty.
// The conversations are locked (by id, to acquire locks in a consistent order, after
// the club locks) before the other participants are counted. The second transaction
// waits for the first one's commit and then counts again, so it sees the real state.
async function deleteDirectMessagesLeftEmpty(userId: string, tx: Prisma.TransactionClient): Promise<void> {
  const mine = await tx.conversation.findMany({
    where: { kind: "dm", participants: { some: { userId } } },
    select: { id: true },
  });
  if (mine.length === 0) return;
  const ids = mine.map((conversation) => conversation.id);

  await tx.$queryRaw`SELECT id FROM conversations WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;

  // Counted after the lock, in a new statement, so it sees what the other transaction committed.
  // A participant row exists only while its account does (cascade), so a row is an account
  const stillShared = await tx.conversationParticipant.findMany({
    where: { conversationId: { in: ids }, userId: { not: userId } },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });
  const keep = new Set(stillShared.map((participant) => participant.conversationId));

  // Messages go with the conversation (cascade)
  await tx.conversation.deleteMany({ where: { id: { in: ids.filter((id) => !keep.has(id)) } } });
}
