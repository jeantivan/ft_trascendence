import type { Prisma } from "@/generated/prisma/client";

// Deletes the user's pending Contacts with people they no longer share any Group with, in any
// club; accepted Contacts stay. Returns how many it deleted. Call it inside the transaction
// that removes the user from the Group or the club, after the removal (#150, #151, #154).
export async function cancelPendingContactsWithoutSharedGroup(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  const myGroups = await tx.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  const groupIds = myGroups.map((row) => row.groupId);

  // People who still share at least one Group with the user: their pending Contacts stay
  const groupMates = await tx.groupMember.findMany({
    where: { groupId: { in: groupIds }, userId: { not: userId } },
    select: { userId: true },
  });
  const keep = groupMates.map((row) => row.userId);

  const deleted = await tx.contact.deleteMany({
    where: {
      status: "pending",
      OR: [
        { userA: userId, userB: { notIn: keep } },
        { userB: userId, userA: { notIn: keep } },
      ],
    },
  });
  return deleted.count;
}
