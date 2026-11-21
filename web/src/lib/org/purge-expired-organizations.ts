import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Purges clubs whose 30-day notice has expired (deleteAt <= now).
// Each club runs in its own transaction locking the row FOR UPDATE so a concurrent
// cancellation or account deletion cannot race with the physical delete (#217).
export async function purgeExpiredOrganizations(
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<number> {
  const candidates = await db.organization.findMany({
    where: { deleteAt: { lte: now } },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  let purged = 0;
  for (const candidate of candidates) {
    const deleted = await db.$transaction(
      async (tx) => {
        const clubs = await tx.$queryRaw<{ id: string; delete_at: Date | null }[]>`
          SELECT id, delete_at FROM organizations WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        if (clubs.length === 0) return false;
        const club = clubs[0];
        if (club.delete_at === null || club.delete_at > now) return false;

        // 1. Feedback linked to events of this club (Feedback.event has onDelete: SetNull)
        await tx.feedback.deleteMany({ where: { event: { orgId: candidate.id } } });
        // 2. Sessions of this club (TrainingSession.organization has onDelete: Restrict;
        //    cascades to session_logs)
        await tx.trainingSession.deleteMany({ where: { orgId: candidate.id } });
        // 3. Organization itself (cascades memberships, requests, groups, templates, events & chats)
        await tx.organization.delete({ where: { id: candidate.id } });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (deleted) purged += 1;
  }

  return purged;
}
