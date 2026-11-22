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

    async findAccountData(userId) {
      // RepeatableRead: every query sees the same snapshot, so a club left halfway
      // through the export cannot show up in memberships but not in groups
      const [user, memberships] =
        await db.$transaction(
          [
            db.user.findUnique({
              where: { id: userId },
              select: {
                statsPublic: true,
                notificationsEnabled: true,
                showOnline: true,
                healthConsentAt: true,
                healthConsentVersion: true,
              },
            }),
            db.membership.findMany({
              where: { userId },
              select: {
                orgId: true,
                role: true,
                joinedAt: true,
                organization: { select: { name: true } },
              },
              orderBy: [{ joinedAt: "asc" }, { orgId: "asc" }],
            }),
          ],
          { isolationLevel: "RepeatableRead" },
        );
      if (user === null) return null;
      return {
        settings: {
          statsPublic: user.statsPublic,
          notificationsEnabled: user.notificationsEnabled,
          showOnline: user.showOnline,
        },
        consents: { healthConsentAt: user.healthConsentAt, healthConsentVersion: user.healthConsentVersion },
        memberships: memberships.map((membership) => ({
          orgId: membership.orgId,
          orgName: membership.organization.name,
          role: membership.role,
          joinedAt: membership.joinedAt,
        })),
      };
    },

    async findSessions(userId) {
      return db.trainingSession.findMany({
        where: {
          OR: [
            { athleteId: userId },
            { group: { members: { some: { userId } } } },
            // Group sessions only: another athlete's individual session is never hers
            { athleteId: null, logs: { some: { athleteId: userId } } },
            // The group session her customized copy modifies, even if she left the group
            { customizations: { some: { athleteId: userId } } },
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
