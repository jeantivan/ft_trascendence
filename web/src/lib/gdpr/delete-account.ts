import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { lockAccountAndAdmins } from "@/lib/admin/lock-account-and-admins";
import { verifyOtpWithoutConsuming } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";
import { deleteAvatarFiles } from "@/lib/uploads/delete-avatar-files";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

export const CLUB_WITHOUT_MANAGER = "club_without_manager";

export type DeleteAccountResult =
  // avatarCleanupFailed is only present when some avatar file could not be removed
  | { deleted: true; avatarCleanupFailed?: number }
  | { deleted: false; reason: "invalid_code" | "last_admin" };

export type DeleteAccountAsAdminResult =
  | { deleted: true; avatarCleanupFailed?: number }
  | { deleted: false; reason: "not_found" | "last_admin" };

// Thrown inside the transaction when the code could not be consumed; caught
// below and returned as invalid_code. Any other error is rethrown unchanged.
class OtpNotConsumedError extends Error {}

// Thrown inside the transaction when the deletion would leave no unblocked Admin;
// the whole transaction rolls back (the code is not consumed either).
class LastAdminError extends Error {}

// Thrown inside the Admin transaction when the account does not exist (any more)
class AccountNotFoundError extends Error {}

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
//    The user row is locked before reading them, so no upload can add one in between.
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
        avatarPaths = await deleteLockedAccount(userId, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (error instanceof OtpNotConsumedError || error instanceof AccountNotFoundError) {
      return { deleted: false, reason: "invalid_code" };
    }
    if (error instanceof LastAdminError) return { deleted: false, reason: "last_admin" };
    throw error;
  }

  // Committed: the account is gone. A disk failure must not look like it still exists
  const failed = await deleteAvatarFiles(avatarPaths, uploadsDir);
  if (failed === 0) return { deleted: true };
  // Only the count: no paths, email, code or error
  console.warn(`Account deleted, but ${failed} avatar file(s) could not be removed`);
  return { deleted: true, avatarCleanupFailed: failed };
}

// Deletes another person's account for the Admin panel (#104), without OTP. It deletes the
// same as deleteAccountWithOtp: both go through deleteLockedAccount. The caller has already
// checked that the actor is an Admin (in the database, not in the JWT) and passes its own
// audit row in beforeDelete, which runs inside the same transaction: if the deletion fails,
// the audit row rolls back with it.
export async function deleteAccountAsAdmin(
  targetId: string,
  beforeDelete: (tx: Prisma.TransactionClient) => Promise<void>,
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
): Promise<DeleteAccountAsAdminResult> {
  let avatarPaths: string[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        await beforeDelete(tx);
        avatarPaths = await deleteLockedAccount(targetId, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (error instanceof AccountNotFoundError) return { deleted: false, reason: "not_found" };
    if (error instanceof LastAdminError) return { deleted: false, reason: "last_admin" };
    throw error;
  }

  const failed = await deleteAvatarFiles(avatarPaths, uploadsDir);
  if (failed === 0) return { deleted: true };
  console.warn(`Account deleted, but ${failed} avatar file(s) could not be removed`);
  return { deleted: true, avatarCleanupFailed: failed };
}

// The part both entries share, inside their transaction. Returns the avatar paths to delete
// from disk after the commit.
//
// First step: lockAccountAndAdmins (one ordered statement, the last-Admin rule is read after the
// lock; see docs/adr/0004). The lock on the user row goes before reading the avatars (#122): an
// upload that commits after that read would lose its Avatar row to the cascade and leave its
// file behind. The Admins stay locked until the commit, so none of them can be deleted between
// reading them and notifying them.
// Lock order: users first, then clubs, then conversations (deleteAccountRows).
async function deleteLockedAccount(userId: string, tx: Prisma.TransactionClient): Promise<string[]> {
  const { target, anotherAdminLeft } = await lockAccountAndAdmins(tx, userId);
  if (!target) throw new AccountNotFoundError();
  if (target.roleGlobal === "admin" && !anotherAdminLeft) throw new LastAdminError();

  const avatars = await tx.avatar.findMany({ where: { ownerId: userId }, select: { path: true } });
  await deleteAccountRows(userId, tx);
  return avatars.map((avatar) => avatar.path);
}

// Deletes the user row; Postgres removes or detaches the rest through the
// onDelete rules (docs/gdpr/account-deletion-table.md). If the user is the only
// Manager of a club, every remaining Admin gets a notification (the deletion is
// never blocked). Private: it must only run from deleteLockedAccount, after the code has
// been consumed (OTP) or the Admin check made (panel) in the same transaction.
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
