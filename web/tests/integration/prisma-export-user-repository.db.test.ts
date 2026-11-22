// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPrismaExportUserRepository } from "@/lib/gdpr/export/prisma-export-user-repository";

const email = "export-user-repository@example.com";
const otherEmail = "export-user-repository-other@example.com";
const orgName = "export-user-repository-org";
const repository = createPrismaExportUserRepository(prisma);

describe("Integration: createPrismaExportUserRepository", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    // Restrict: a club with sessions cannot be deleted, so the sessions go first
    await prisma.trainingSession.deleteMany({ where: { organization: { name: orgName } } });
    await prisma.organization.deleteMany({ where: { name: orgName } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("devuelve el perfil con los métodos de acceso y sin secretos", async () => {
    const user = await prisma.user.create({
      data: {
        email,
        nick: "runner",
        passwordHash: "$2b$10$secret-hash",
        email2faEnabled: true,
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: "export-repo-google-1",
            access_token: "oauth-access-token",
          },
        },
      },
    });

    const profile = await repository.findProfile(user.id);

    expect(profile).toEqual({
      id: user.id,
      email,
      nick: "runner",
      image: null,
      createdAt: user.createdAt,
      hasPassword: true,
      providers: ["google"],
      totpEnabled: false,
      email2faEnabled: true,
    });
    expect(JSON.stringify(profile)).not.toContain("secret-hash");
    expect(JSON.stringify(profile)).not.toContain("oauth-access-token");
  });

  it("devuelve null si el usuario no existe", async () => {
    await expect(repository.findProfile("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
  });

  describe("findAccountData", () => {
    const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T08:00:00.000Z`);

    async function createFixture() {
      const user = await prisma.user.create({
        data: {
          email,
          nick: "runner",
          statsPublic: true,
          showOnline: false,
          healthConsentAt: at(1),
          healthConsentVersion: 2,
        },
      });
      const other = await prisma.user.create({ data: { email: otherEmail, nick: "other" } });
      const org = await prisma.organization.create({ data: { name: orgName, timezone: "Europe/Madrid" } });
      return { user, other, org };
    }

    it("devuelve los ajustes y el consentimiento del usuario", async () => {
      const { user } = await createFixture();

      const data = await repository.findAccountData(user.id);

      expect(data).toMatchObject({
        settings: { statsPublic: true, notificationsEnabled: true, showOnline: false },
        consents: { healthConsentAt: at(1), healthConsentVersion: 2 },
      });
    });

    it("devuelve los clubes del usuario con el nombre y su rol", async () => {
      const { user, other, org } = await createFixture();
      await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: "athlete", joinedAt: at(2) } });
      await prisma.membership.create({ data: { userId: other.id, orgId: org.id, role: "manager" } });

      const data = await repository.findAccountData(user.id);

      expect(data?.memberships).toEqual([{ orgId: org.id, orgName, role: "athlete", joinedAt: at(2) }]);
    });

    it("devuelve null en los dos consentimientos si no los dio", async () => {
      const user = await prisma.user.create({ data: { email } });

      const data = await repository.findAccountData(user.id);

      expect(data?.consents).toEqual({ healthConsentAt: null, healthConsentVersion: null });
    });

    it("devuelve null si el usuario no existe", async () => {
      await expect(repository.findAccountData("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
    });
  });

  describe("findSessions", () => {
    const base = { origin: "template", sessionType: "rodaje" } as const;

    async function createFixture() {
      const user = await prisma.user.create({ data: { email, nick: "runner" } });
      const other = await prisma.user.create({ data: { email: otherEmail, nick: "other" } });
      const org = await prisma.organization.create({ data: { name: orgName, timezone: "Europe/Madrid" } });
      const currentGroup = await prisma.group.create({ data: { orgId: org.id, name: "current" } });
      const leftGroup = await prisma.group.create({ data: { orgId: org.id, name: "left" } });
      const foreignGroup = await prisma.group.create({ data: { orgId: org.id, name: "foreign" } });
      await prisma.groupMember.create({ data: { groupId: currentGroup.id, userId: user.id } });
      await prisma.groupMember.create({ data: { groupId: foreignGroup.id, userId: other.id } });
      return { user, other, org, currentGroup, leftGroup, foreignGroup };
    }

    it("devuelve las sesiones individuales, las de sus grupos y las de grupos que dejó si tiene registro", async () => {
      const { user, other, org, currentGroup, leftGroup, foreignGroup } = await createFixture();
      const at = (day: number) => new Date(`2026-11-${day}T08:00:00.000Z`);
      const individual = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, athleteId: user.id, scheduledAt: at(10), targetDistanceM: 5000 },
      });
      const ofCurrentGroup = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: currentGroup.id, scheduledAt: at(11), targetPaceSPerKm: 300 },
      });
      const ofLeftGroup = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: leftGroup.id, scheduledAt: at(12), targetDurationS: 1800 },
      });
      await prisma.sessionLog.create({
        data: { sessionId: ofLeftGroup.id, athleteId: user.id, completed: true, performedAt: at(12) },
      });
      // Not hers: a left group without her log, a group she never belonged to, someone else's
      await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: leftGroup.id, scheduledAt: at(13) },
      });
      await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: foreignGroup.id, scheduledAt: at(14) },
      });
      await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, athleteId: other.id, scheduledAt: at(15) },
      });

      const sessions = await repository.findSessions(user.id);

      expect(sessions).toEqual([
        {
          id: individual.id,
          orgId: org.id,
          origin: "template",
          sessionType: "rodaje",
          targetDistanceM: 5000,
          targetPaceSPerKm: null,
          targetDurationS: null,
          scheduledAt: at(10),
          groupId: null,
          customizesSessionId: null,
        },
        expect.objectContaining({ id: ofCurrentGroup.id, groupId: currentGroup.id, targetPaceSPerKm: 300 }),
        expect.objectContaining({ id: ofLeftGroup.id, groupId: leftGroup.id, targetDurationS: 1800 }),
      ]);
    });

    it("devuelve la sesión que su copia personalizada modifica", async () => {
      const { user, org, currentGroup } = await createFixture();
      const groupSession = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: currentGroup.id, scheduledAt: new Date("2026-11-10T08:00:00.000Z") },
      });
      const copy = await prisma.trainingSession.create({
        data: {
          orgId: org.id,
          origin: "customized",
          sessionType: "rodaje",
          athleteId: user.id,
          customizesSessionId: groupSession.id,
          scheduledAt: new Date("2026-11-10T08:00:00.000Z"),
        },
      });

      const sessions = await repository.findSessions(user.id);

      expect(sessions.map((session) => session.id).sort()).toEqual([groupSession.id, copy.id].sort());
      expect(sessions.find((session) => session.id === copy.id)?.customizesSessionId).toBe(groupSession.id);
    });

    it("devuelve la sesión original de su copia aunque haya dejado el grupo", async () => {
      const { user, org, currentGroup } = await createFixture();
      const groupSession = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: currentGroup.id, scheduledAt: new Date("2026-11-10T08:00:00.000Z") },
      });
      const copy = await prisma.trainingSession.create({
        data: {
          orgId: org.id,
          origin: "customized",
          sessionType: "rodaje",
          athleteId: user.id,
          customizesSessionId: groupSession.id,
          scheduledAt: new Date("2026-11-10T08:00:00.000Z"),
        },
      });
      await prisma.groupMember.deleteMany({ where: { groupId: currentGroup.id, userId: user.id } });

      const sessions = await repository.findSessions(user.id);

      expect(sessions.map((session) => session.id).sort()).toEqual([groupSession.id, copy.id].sort());
    });

    it("no devuelve la sesión individual de otro atleta aunque tenga un registro suyo", async () => {
      const { user, other, org } = await createFixture();
      const othersSession = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, athleteId: other.id, scheduledAt: new Date("2026-11-10T08:00:00.000Z") },
      });
      await prisma.sessionLog.create({
        data: { sessionId: othersSession.id, athleteId: user.id, completed: true, performedAt: new Date("2026-11-10T09:00:00.000Z") },
      });

      await expect(repository.findSessions(user.id)).resolves.toEqual([]);
    });

    it("devuelve una lista vacía si no tiene sesiones", async () => {
      const { user } = await createFixture();

      await expect(repository.findSessions(user.id)).resolves.toEqual([]);
    });
  });
});
