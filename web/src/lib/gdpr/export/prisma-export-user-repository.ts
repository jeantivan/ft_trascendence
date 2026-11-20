import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ExportUserRepository } from "@/lib/gdpr/export/build-export-files";

// Explicit select: passwordHash, totpSecret and the OAuth tokens of accounts are
// never read, so they cannot end up in the export (#165).
export function createPrismaExportUserRepository(db: PrismaClient = prisma): ExportUserRepository {
  return {
    async findProfile(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          nick: true,
          image: true,
          createdAt: true,
          passwordHash: true,
          totpEnabled: true,
          email2faEnabled: true,
          accounts: { select: { provider: true } },
        },
      });
      if (user === null) return null;
      return {
        id: user.id,
        email: user.email,
        nick: user.nick,
        image: user.image,
        createdAt: user.createdAt,
        hasPassword: user.passwordHash !== null,
        providers: user.accounts.map((account) => account.provider),
        totpEnabled: user.totpEnabled,
        email2faEnabled: user.email2faEnabled,
      };
    },

    async findSessions(userId) {
      return db.trainingSession.findMany({
        where: {
          OR: [
            { athleteId: userId },
            { group: { members: { some: { userId } } } },
            { logs: { some: { athleteId: userId } } },
          ],
        },
        select: {
          id: true,
          orgId: true,
          origin: true,
          sessionType: true,
          targetDistanceM: true,
          targetPaceSPerKm: true,
          targetDurationS: true,
          scheduledAt: true,
          groupId: true,
          customizesSessionId: true,
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      });
    },
  };
}
