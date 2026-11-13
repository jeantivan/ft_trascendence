import type { Prisma } from "@/generated/prisma/client";

export type LockedAccount = { id: string; roleGlobal: string; blockedAt: Date | null };

export type LockAccountAndAdminsResult = {
  // null when the account does not exist (any more)
  target: LockedAccount | null;
  // At least one unblocked Admin other than the target, read after the lock
  anotherAdminLeft: boolean;
};

// First step of every operation that can leave the system without an unblocked Admin: deleting
// an account (#158), blocking it (#102), removing its Admin role (#103). The callers apply the
// rule with the result: if target is an Admin and anotherAdminLeft is false, they refuse.
//
// ONE statement locks the target row together with every Admin row, ordered by id. One statement
// in id order means two transactions always take the rows in the same order, so two Admins acting
// on each other cannot deadlock (40P01); locking the own row first and the other Admins after
// would. The rule is read after the lock, so a second transaction waits for the first commit and
// then sees the real state; counting before the lock lets both pass and leaves nobody.
// FOR UPDATE, not user.update: it also waits for an upload's avatar insert (its foreign key
// check holds a KEY SHARE lock on the user row) (#122). The Admins stay locked until the commit.
// The wait counts against the transaction timeout (5 s by default).
// docs/adr/0004-bloqueo-unico-de-la-cuenta-y-los-admins.md explains why not only the own row.
export async function lockAccountAndAdmins(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<LockAccountAndAdminsResult> {
  const locked = await tx.$queryRaw<(LockedAccount)[]>`
    SELECT id, role_global AS "roleGlobal", blocked_at AS "blockedAt"
    FROM users
    WHERE id = ${userId}::uuid OR role_global = 'admin'
    ORDER BY id
    FOR UPDATE`;

  const target = locked.find((row) => row.id === userId) ?? null;
  const anotherAdminLeft = locked.some(
    (row) => row.id !== userId && row.roleGlobal === "admin" && row.blockedAt === null,
  );
  return { target, anotherAdminLeft };
}
