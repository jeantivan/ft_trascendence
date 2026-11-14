// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PrismaUserRepository } from "@/lib/auth/user-repository";
import { UserSettingsService } from "@/lib/user/user-settings-service";

const EMAIL_PREFIX = "user-settings-db-test-";
const ORG_PREFIX = "user-settings-db-test-org-";
const repo = new PrismaUserRepository(prisma);
const service = new UserSettingsService(repo);

describe("Integration: user privacy and health consent (Postgres)", () => {
  afterEach(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: EMAIL_PREFIX } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await prisma.sessionLog.deleteMany({
        where: { athleteId: { in: ids } },
      });
      await prisma.feedback.deleteMany({
        where: { athleteId: { in: ids } },
      });
      await prisma.trainingSession.deleteMany({
        where: { athleteId: { in: ids } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: ids } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: ids } },
      });
    }
    await prisma.organization.deleteMany({
      where: { name: { startsWith: ORG_PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("updates privacy settings in database", async () => {
    const user = await repo.createUser({
      email: `${EMAIL_PREFIX}privacy@example.com`,
      nick: "privacy_athlete",
    });

    const updated = await service.updatePrivacy(user.id, {
      statsPublic: true,
      showOnline: false,
      notificationsEnabled: false,
    });

    expect(updated.statsPublic).toBe(true);
    expect(updated.showOnline).toBe(false);
    expect(updated.notificationsEnabled).toBe(false);

    const fromDb = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fromDb.statsPublic).toBe(true);
    expect(fromDb.showOnline).toBe(false);
    expect(fromDb.notificationsEnabled).toBe(false);
  });

  it("updates a single privacy setting without changing the others in database", async () => {
    const user = await repo.createUser({
      email: `${EMAIL_PREFIX}partial-privacy@example.com`,
      nick: "partial_privacy",
    });

    const updated = await service.updatePrivacy(user.id, {
      showOnline: false,
    });

    expect(updated.showOnline).toBe(false);
    expect(updated.statsPublic).toBe(false);
    expect(updated.notificationsEnabled).toBe(true);

    const fromDb = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fromDb.showOnline).toBe(false);
    expect(fromDb.statsPublic).toBe(false);
    expect(fromDb.notificationsEnabled).toBe(true);
  });

  it("gives and withdraws health consent with audit logs respecting CHECK constraint", async () => {
    const user = await repo.createUser({
      email: `${EMAIL_PREFIX}consent@example.com`,
      nick: "consent_athlete",
    });

    // 1. Give consent
    const consentProfile = await service.giveHealthConsent(user.id);
    expect(consentProfile.healthConsentAt).not.toBeNull();
    expect(consentProfile.healthConsentVersion).toBe(1);

    const dbUserAfterGiven = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUserAfterGiven.healthConsentAt).not.toBeNull();
    expect(dbUserAfterGiven.healthConsentVersion).toBe(1);

    const givenAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: user.id, action: "consent_given" },
    });
    expect(givenAudit.resource).toBe("health_consent");
    expect(givenAudit.actorRole).toBeNull();
    expect(givenAudit.subjectId).toBe(user.id);

    // 2. Withdraw consent
    const withdrawnProfile = await service.withdrawHealthConsent(user.id);
    expect(withdrawnProfile.healthConsentAt).toBeNull();
    expect(withdrawnProfile.healthConsentVersion).toBeNull();

    const dbUserAfterWithdrawn = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUserAfterWithdrawn.healthConsentAt).toBeNull();
    expect(dbUserAfterWithdrawn.healthConsentVersion).toBeNull();

    const withdrawnAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: user.id, action: "consent_withdrawn" },
    });
    expect(withdrawnAudit.resource).toBe("health_consent");
    expect(withdrawnAudit.actorRole).toBeNull();
    expect(withdrawnAudit.subjectId).toBe(user.id);
  });

  it("is a no-op in database when giving consent twice or withdrawing without prior consent", async () => {
    const user = await repo.createUser({
      email: `${EMAIL_PREFIX}idempotent@example.com`,
      nick: "idempotent_athlete",
    });

    // Withdraw before ever consenting -> 0 audit rows
    await service.withdrawHealthConsent(user.id);
    expect(await prisma.auditLog.count({ where: { actorId: user.id } })).toBe(0);

    // Give consent twice -> keeps original timestamp and only 1 audit row
    const first = await service.giveHealthConsent(user.id);
    const second = await service.giveHealthConsent(user.id);
    expect(second.healthConsentAt).toEqual(first.healthConsentAt);
    expect(
      await prisma.auditLog.count({ where: { actorId: user.id, action: "consent_given" } })
    ).toBe(1);
  });

  it("purges health data (RPE, cardiac metrics, feedback) while preserving volume, sessions and other athletes", async () => {
    const user = await repo.createUser({
      email: `${EMAIL_PREFIX}purge@example.com`,
      nick: "purge_athlete",
    });
    const otherUser = await repo.createUser({
      email: `${EMAIL_PREFIX}other@example.com`,
      nick: "other_athlete",
    });

    const org = await prisma.organization.create({
      data: {
        name: `${ORG_PREFIX}${user.id.slice(0, 8)}`,
        timezone: "Europe/Madrid",
      },
    });

    const session = await prisma.trainingSession.create({
      data: {
        orgId: org.id,
        athleteId: user.id,
        origin: "free",
        sessionType: "rodaje",
        scheduledAt: new Date(),
      },
    });
    const session2 = await prisma.trainingSession.create({
      data: {
        orgId: org.id,
        athleteId: user.id,
        origin: "free",
        sessionType: "rodaje",
        scheduledAt: new Date(),
      },
    });
    const otherSession = await prisma.trainingSession.create({
      data: {
        orgId: org.id,
        athleteId: otherUser.id,
        origin: "free",
        sessionType: "rodaje",
        scheduledAt: new Date(),
      },
    });

    const log = await prisma.sessionLog.create({
      data: {
        sessionId: session.id,
        athleteId: user.id,
        completed: true,
        rpe: 8,
        distanceM: 10000,
        durationS: 3600,
        performedAt: new Date(),
        extra: { avgHeartRate: 165, incompletion_reason: "none" },
      },
    });
    const heartOnlyLog = await prisma.sessionLog.create({
      data: {
        sessionId: session2.id,
        athleteId: user.id,
        completed: true,
        rpe: 6,
        distanceM: 5000,
        durationS: 1800,
        performedAt: new Date(),
        extra: { avgHeartRate: 165 },
      },
    });
    const otherLog = await prisma.sessionLog.create({
      data: {
        sessionId: otherSession.id,
        athleteId: otherUser.id,
        completed: true,
        rpe: 7,
        distanceM: 5000,
        durationS: 1800,
        performedAt: new Date(),
        extra: { avgHeartRate: 150 },
      },
    });

    const fb = await prisma.feedback.create({
      data: {
        athleteId: user.id,
        body: "Gran entrenamiento",
      },
    });
    const otherFb = await prisma.feedback.create({
      data: {
        athleteId: otherUser.id,
        body: "Buen rodaje",
      },
    });

    // Execute purge for the first athlete only
    await service.purgeHealthData(user.id, { confirm: true });

    // Verify sessionLog: rpe is null, cardiac metrics stripped, incompletion_reason kept, volume kept
    const updatedLog = await prisma.sessionLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(updatedLog.rpe).toBeNull();
    expect(updatedLog.completed).toBe(true);
    expect(updatedLog.distanceM).toBe(10000);
    expect(updatedLog.durationS).toBe(3600);
    expect(updatedLog.extra).toEqual({ incompletion_reason: "none" });

    // Verify log with only cardiac metrics gets SQL NULL (Prisma.DbNull)
    const updatedHeartOnlyLog = await prisma.sessionLog.findUniqueOrThrow({
      where: { id: heartOnlyLog.id },
    });
    expect(updatedHeartOnlyLog.rpe).toBeNull();
    expect(updatedHeartOnlyLog.extra).toBeNull();

    // Verify feedback deleted
    const countFb = await prisma.feedback.count({ where: { id: fb.id } });
    expect(countFb).toBe(0);

    // Verify TrainingSession still intact
    const countSession = await prisma.trainingSession.count({ where: { id: session.id } });
    expect(countSession).toBe(1);

    // Verify purge audit log entry
    const purgeAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: user.id, action: "delete", resource: "health_data" },
    });
    expect(purgeAudit.actorRole).toBeNull();
    expect(purgeAudit.subjectId).toBe(user.id);

    // Verify other athlete's health data is untouched
    const untouchedLog = await prisma.sessionLog.findUniqueOrThrow({ where: { id: otherLog.id } });
    expect(untouchedLog.rpe).toBe(7);
    expect(untouchedLog.extra).toEqual({ avgHeartRate: 150 });
    const countOtherFb = await prisma.feedback.count({ where: { id: otherFb.id } });
    expect(countOtherFb).toBe(1);
  });
});
