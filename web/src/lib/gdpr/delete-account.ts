import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export const CLUB_WITHOUT_MANAGER = "club_without_manager";

// Deletes the user row; Postgres removes or detaches the rest through the
// onDelete rules (docs/gdpr/account-deletion-table.md). If the user is the only
// Manager of a club, every remaining Admin gets a notification (the deletion is
// never blocked), all in one transaction: either everything happens or nothing.
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
export async function deleteAccount(userId: string, db: PrismaClient = prisma): Promise<void> {
  await db.$transaction(
    async (tx) => {
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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
