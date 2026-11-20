// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PrismaTrainingRepository } from "@/lib/training/prisma-training-repository";
import type { Prisma } from "@/generated/prisma/client";
import { notify } from "@/lib/notifications/notify";
import { TrainingService } from "@/lib/training/training-service";
import { TRAINING_TEMPLATE_CREATED, TRAINING_TEMPLATE_UPDATED, TRAINING_TEMPLATE_DELETED } from "@/lib/training/types";

const PREFIX = "training-repo-db-";

describe("Integration: PrismaTrainingRepository", () => {
  const repo = new PrismaTrainingRepository(prisma);

  let orgId: string;
  let manager1Id: string;
  let manager2Id: string;
  let athleteId: string;
  let groupId: string;

  beforeEach(async () => {
    const club = await prisma.organization.create({
      data: { name: `${PREFIX}Club`, timezone: "Europe/Madrid" },
    });
    orgId = club.id;

    const manager1 = await prisma.user.create({
      data: { email: `${PREFIX}mgr1@test.com`, nick: "Manager1" },
    });
    manager1Id = manager1.id;

    const manager2 = await prisma.user.create({
      data: { email: `${PREFIX}mgr2@test.com`, nick: "Manager2" },
    });
    manager2Id = manager2.id;

    const athlete = await prisma.user.create({
      data: { email: `${PREFIX}ath@test.com`, nick: "Athlete1" },
    });
    athleteId = athlete.id;

    await prisma.membership.createMany({
      data: [
        { orgId, userId: manager1Id, role: "manager" },
        { orgId, userId: manager2Id, role: "manager" },
        { orgId, userId: athleteId, role: "athlete" },
      ],
    });

    const group = await prisma.group.create({
      data: { orgId, name: `${PREFIX}Group` },
    });
    groupId = group.id;

    await prisma.groupMember.create({
      data: { groupId, userId: athleteId },
    });
  });

  afterEach(async () => {
    await prisma.trainingSession.deleteMany({
      where: { orgId },
    });
    await prisma.organization.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("finds role and other managers in database", async () => {
    const role1 = await repo.findRole(orgId, manager1Id);
    const roleAth = await repo.findRole(orgId, athleteId);
    expect(role1).toBe("manager");
    expect(roleAth).toBe("athlete");

    const otherManagers = await repo.findOtherManagerIds(orgId, manager1Id);
    expect(otherManagers).toEqual([manager2Id]);
  });

  it("creates a template with sessions ordered by position in Postgres", async () => {
    const created = await repo.create({
      orgId,
      name: "10K Progression",
      createdBy: manager1Id,
      sessions: [
        { sessionType: "rodaje", dayOffset: 0, targetDistanceM: 5000 },
        { sessionType: "intervalos", dayOffset: 2, targetDistanceM: 8000 },
      ],
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("10K Progression");
    expect(created.sessions).toHaveLength(2);
    expect(created.sessions[0].position).toBe(0);
    expect(created.sessions[1].position).toBe(1);

    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.sessions[0].sessionType).toBe("rodaje");
    expect(found?.sessions[1].sessionType).toBe("intervalos");
  });

  it("lists all templates for manager and only assigned templates for athlete", async () => {
    const t1 = await repo.create({
      orgId,
      name: "Assigned Template",
      createdBy: manager1Id,
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });

    const t2 = await repo.create({
      orgId,
      name: "Unassigned Template",
      createdBy: manager2Id,
      sessions: [{ sessionType: "tirada_larga", dayOffset: 6 }],
    });

    // Manager sees both
    const managerList = await repo.listForManager(orgId);
    expect(managerList.map((t) => t.id)).toEqual(
      expect.arrayContaining([t1.id, t2.id])
    );

    // Athlete sees 0 before assignment
    const athleteListBefore = await repo.listForAthlete(orgId, athleteId);
    expect(athleteListBefore).toHaveLength(0);

    // Assign t1 to athlete's group via a TrainingSession
    await prisma.trainingSession.create({
      data: {
        orgId,
        groupId,
        origin: "template",
        scheduledAt: new Date(),
        sessionType: "rodaje",
        sourceTemplateId: t1.id,
      },
    });

    // Athlete now sees t1 but not t2
    const athleteListAfter = await repo.listForAthlete(orgId, athleteId);
    expect(athleteListAfter).toHaveLength(1);
    expect(athleteListAfter[0].id).toBe(t1.id);
  });

  it("updates template name and replaces sessions in database transaction without altering existing TrainingSession copies", async () => {
    const created = await repo.create({
      orgId,
      name: "Original Name",
      createdBy: manager1Id,
      sessions: [{ sessionType: "rodaje", dayOffset: 0, targetDistanceM: 6000 }],
    });

    const scheduledAt = new Date("2026-11-20T09:00:00.000Z");
    const copySession = await prisma.trainingSession.create({
      data: {
        orgId,
        groupId,
        origin: "template",
        scheduledAt,
        sessionType: "rodaje",
        targetDistanceM: 6000,
        sourceTemplateId: created.id,
      },
    });

    const updated = await repo.update(created.id, {
      name: "Updated Name",
      sessions: [
        { sessionType: "cuestas", dayOffset: 3, targetDistanceM: 10000 },
        { sessionType: "fartlek", dayOffset: 5 },
      ],
    });

    expect(updated.name).toBe("Updated Name");
    expect(updated.sessions).toHaveLength(2);
    expect(updated.sessions[0].sessionType).toBe("cuestas");
    expect(updated.sessions[0].position).toBe(0);
    expect(updated.sessions[1].sessionType).toBe("fartlek");
    expect(updated.sessions[1].position).toBe(1);

    // Verify previously copied TrainingSession is completely intact
    const copyAfterUpdate = await prisma.trainingSession.findUnique({
      where: { id: copySession.id },
    });
    expect(copyAfterUpdate).not.toBeNull();
    expect(copyAfterUpdate?.sessionType).toBe("rodaje");
    expect(copyAfterUpdate?.targetDistanceM).toBe(6000);
    expect(copyAfterUpdate?.sourceTemplateId).toBe(created.id);
  });

  it("returns null on malformed non-UUID templateId instead of throwing P2023", async () => {
    expect(await repo.findById("not-a-valid-uuid")).toBeNull();
  });

  it("rolls back database transaction when afterWrite callback throws", async () => {
    await expect(
      repo.create(
        {
          orgId,
          name: "Rolled Back Template",
          createdBy: manager1Id,
          sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
        },
        async () => {
          throw new Error("Simulated notification failure");
        }
      )
    ).rejects.toThrow("Simulated notification failure");

    const list = await repo.listForManager(orgId);
    expect(list).toHaveLength(0);
  });

  it("deletes template and cascades sessions while setting sourceTemplateId to null on TrainingSession", async () => {
    const template = await repo.create({
      orgId,
      name: "To Be Deleted",
      createdBy: manager1Id,
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });

    const copySession = await prisma.trainingSession.create({
      data: {
        orgId,
        groupId,
        origin: "template",
        scheduledAt: new Date(),
        sessionType: "rodaje",
        sourceTemplateId: template.id,
      },
    });

    await repo.delete(template.id);

    expect(await repo.findById(template.id)).toBeNull();

    // Verify template_sessions were cascade deleted
    const dbSessions = await prisma.templateSession.findMany({
      where: { templateId: template.id },
    });
    expect(dbSessions).toHaveLength(0);

    // Verify TrainingSession remains intact with sourceTemplateId = null
    const updatedCopy = await prisma.trainingSession.findUnique({
      where: { id: copySession.id },
    });
    expect(updatedCopy).not.toBeNull();
    expect(updatedCopy?.sourceTemplateId).toBeNull();
  });

  it("persists notifications in Postgres for other managers on create, update, and delete", async () => {
    const trainingService = new TrainingService(repo, (tx, input) =>
      notify(tx as Prisma.TransactionClient, input)
    );

    const created = await trainingService.createTemplate(manager1Id, orgId, {
      name: "Notify Test",
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });
    await trainingService.updateTemplate(manager1Id, orgId, created.id, {
      name: "Notify Test Updated",
    });
    await trainingService.deleteTemplate(manager1Id, orgId, created.id);

    const manager2Notifications = await prisma.notification.findMany({
      where: { userId: manager2Id },
      orderBy: { id: "asc" },
    });
    expect(manager2Notifications).toHaveLength(3);

    const expectedPayload = { orgId, templateId: created.id, actorId: manager1Id };
    expect(manager2Notifications.map((n) => n.type)).toEqual([
      TRAINING_TEMPLATE_CREATED,
      TRAINING_TEMPLATE_UPDATED,
      TRAINING_TEMPLATE_DELETED,
    ]);
    for (const notification of manager2Notifications) {
      expect(notification.readAt).toBeNull();
      expect(notification.payload).toEqual(expectedPayload);
    }

    const otherUsersNotifications = await prisma.notification.findMany({
      where: { userId: { in: [manager1Id, athleteId] } },
    });
    expect(otherUsersNotifications).toHaveLength(0);
  });
});
