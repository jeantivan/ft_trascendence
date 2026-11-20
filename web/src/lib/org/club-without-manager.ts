import type { Prisma } from "@/generated/prisma/client";
import { notify as realNotify } from "@/lib/notifications/notify";

export const CLUB_WITHOUT_MANAGER = "club_without_manager";

// The callers take notify() as a port so tests can swap it for a fake with the same signature
export type Notify = typeof realNotify;

// Locks the clubs (by id, to acquire club locks in a consistent order), counts their Managers
// other than leavingUserId and, for each club left without one, notifies every Admin except
// leavingUserId. Never blocks: the caller removes the Manager either way.
//
// Call it inside the transaction that removes the Manager, after locking the user row (lock
// order: users, then clubs, then conversations; ADR 0004). The count is made after the club
// lock, in a new statement, so it sees what a concurrent transaction committed; the second of
// two Managers leaving at the same time waits for the first and counts again.
//
// The payload carries only the club id (ADR 0001). club_without_manager is always sent, even
// to an Admin who turned notifications off (jmateo-v, #127).
export async function notifyAdminsOfClubsWithoutManager(
  tx: Prisma.TransactionClient,
  orgIds: string[],
  leavingUserId: string,
  notify: Notify = realNotify,
): Promise<void> {
  if (orgIds.length === 0) return;

  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ANY(${orgIds}::uuid[]) ORDER BY id FOR UPDATE`;

  const withoutManager: string[] = [];
  for (const orgId of orgIds) {
    const others = await tx.membership.count({
      where: { orgId, role: "manager", userId: { not: leavingUserId } },
    });
    if (others === 0) withoutManager.push(orgId);
  }
  if (withoutManager.length === 0) return;

  const admins = await tx.user.findMany({
    where: { roleGlobal: "admin", id: { not: leavingUserId } },
    select: { id: true },
  });
  for (const admin of admins) {
    for (const orgId of withoutManager) {
      await notify(tx, { userId: admin.id, type: CLUB_WITHOUT_MANAGER, payload: { orgId } });
    }
  }
}
