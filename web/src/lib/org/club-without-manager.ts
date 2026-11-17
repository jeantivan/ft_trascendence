import type { Prisma } from "@/generated/prisma/client";

export const CLUB_WITHOUT_MANAGER = "club_without_manager";

// Same signature as notify() of #153: called with the tx of the write it belongs to, so a
// failure rolls everything back. Returns the notification id, or null when none was created.
export type Notify = (
  tx: Prisma.TransactionClient,
  input: { userId: string; type: string; payload: Record<string, string> },
) => Promise<bigint | null>;

// Stand-in until #153 is merged: always writes the row, with no preference check
export const insertNotification: Notify = async (tx, { userId, type, payload }) => {
  const row = await tx.notification.create({ data: { userId, type, payload }, select: { id: true } });
  return row.id;
};

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
  notify: Notify = insertNotification,
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
