import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAdminAction } from "@/lib/gdpr/record-admin-action";
import { notify as realNotify } from "@/lib/notifications/notify";
import { notifyAdminsOfClubsWithoutManager, type Notify } from "./club-without-manager";
import { cancelPendingContactsWithoutSharedGroup } from "../social/cancel-pending-contacts";

export const MEMBERSHIP_REMOVED = "membership_removed";

// The user is not a member of the club (never was, or already left or was expelled)
export class NotMemberError extends Error {
  constructor(message = "The user is not a member of the club") {
    super(message);
    this.name = "NotMemberError";
  }
}

// An actor tried to expel themself; that is leave
export class CannotExpelSelfError extends Error {
  constructor(message = "Use leave to exit your own club") {
    super(message);
    this.name = "CannotExpelSelfError";
  }
}

export type CancelPendingContacts = (tx: Prisma.TransactionClient, userId: string) => Promise<number>;

// Leaving a club (membership.leave) and expelling a member (member.expel), #150.
// Precondition: callers check the permission first (requireOrgRole); this class does not.
export class PrismaClubExit {
  private readonly cancelPendingContacts: CancelPendingContacts;
  private readonly notify: Notify;

  constructor(
    private readonly db: PrismaClient = prisma,
    ports: { cancelPendingContacts?: CancelPendingContacts; notify?: Notify } = {},
  ) {
    this.cancelPendingContacts = ports.cancelPendingContacts ?? cancelPendingContactsWithoutSharedGroup;
    this.notify = ports.notify ?? realNotify;
  }

  // The user leaves on their own. NotMemberError if they are not in the club.
  async leave(userId: string, orgId: string): Promise<void> {
    await this.inTransaction((tx) => this.removeMember(tx, orgId, userId));
  }

  // A Manager or an Admin removes a member; the expelled user is notified (respecting their
  // preference, through notify). NotMemberError if the target is not in the club (also the
  // second of two simultaneous expulsions). actor is for the audit row when it is an Admin.
  async expel(actor: { id: string; role: "manager" | "admin" }, orgId: string, targetId: string): Promise<void> {
    if (actor.id === targetId) throw new CannotExpelSelfError();
    await this.inTransaction(async (tx) => {
      await this.removeMember(tx, orgId, targetId);
      // A Manager's expulsion is not recorded here (#163); an Admin's goes in the same transaction
      if (actor.role === "admin") {
        await recordAdminAction(tx, {
          adminId: actor.id,
          action: "delete",
          resource: "membership",
          subjectId: targetId,
          resourceId: orgId,
        });
      }
      await this.notify(tx, { userId: targetId, type: MEMBERSHIP_REMOVED, payload: { orgId } });
    });
  }

  private inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  // Removes the user from the club and its Groups; warns the Admins if it was the last Manager
  private async removeMember(tx: Prisma.TransactionClient, orgId: string, userId: string): Promise<void> {
    // Same order as account deletion and role changes: user row, then the club (ADR 0004).
    // FOR NO KEY UPDATE on the user: warning the Admins takes a KEY SHARE on their rows
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
    // Read under the user's lock: a role change locks the same row first, so it cannot move meanwhile
    const membership = await tx.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    if (!membership) throw new NotMemberError();
    if (membership.role === "manager") await notifyAdminsOfClubsWithoutManager(tx, [orgId], userId, this.notify);
    await tx.groupMember.deleteMany({ where: { userId, group: { orgId } } });
    await tx.membership.delete({ where: { userId_orgId: { userId, orgId } } });
    // After the removal, so its query already sees the updated Groups
    await this.cancelPendingContacts(tx, userId);
  }
}
