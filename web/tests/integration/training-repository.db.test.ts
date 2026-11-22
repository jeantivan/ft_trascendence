// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PrismaTrainingRepository } from "@/lib/training/prisma-training-repository";
import { notify } from "@/lib/notifications/notify";
import { TrainingNotFoundError } from "@/lib/training/errors";
import { TrainingService } from "@/lib/training/training-service";
import {
  TRAINING_TEMPLATE_CREATED,
  TRAINING_TEMPLATE_UPDATED,
  TRAINING_TEMPLATE_DELETED,
} from "@/lib/training/types";
import { runTrainingRepositoryContract } from "../support/training-repository-contract";

const PREFIX = "training-repo-db-";

describe("Integration: PrismaTrainingRepository", () => {
  const repo = new PrismaTrainingRepository(prisma);

  let orgId: string;
  let otherOrgId: string;
  let manager1Id: string;
  let manager2Id: string;
  let athleteId: string;
  let groupId: string;

  beforeEach(async () => {
    const club = await prisma.organization.create({
      data: { name: `${PREFIX}Club`, timezone: "Europe/Madrid" },
    });
    orgId = club.id;

    const otherClub = await prisma.organization.create({
      data: { name: `${PREFIX}OtherClub`, timezone: "Europe/Madrid" },
    });
    otherOrgId = otherClub.id;

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
      where: { orgId: { in: [orgId, otherOrgId] } },
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

  runTrainingRepositoryContract("Prisma", () => ({
    repo,
    orgId,
    otherOrgId,
    manager1Id,
    manager2Id,
    athleteId,
    groupId,
    assignTemplateToGroup: async (targetGroupId, templateId) => {
      await prisma.trainingSession.create({
        data: {
          orgId,
          groupId: targetGroupId,
          origin: "template",
          scheduledAt: new Date(),
          sessionType: "rodaje",
          sourceTemplateId: templateId,
        },
      });
    },
  }));

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

    const updated = await repo.update(orgId, created.id, {
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

    await repo.delete(orgId, template.id);

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
    const trainingService = new TrainingService(repo, notify);

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

  it("supports uppercase orgId in TrainingService getTemplate and updateTemplate", async () => {
    const trainingService = new TrainingService(repo, notify);
    const upperOrgId = orgId.toUpperCase();

    const created = await trainingService.createTemplate(manager1Id, upperOrgId, {
      name: "Uppercase Service Plan",
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });

    const fetched = await trainingService.getTemplate(
      manager1Id,
      upperOrgId,
      created.id
    );
    expect(fetched.id).toBe(created.id);

    const updated = await trainingService.updateTemplate(
      manager1Id,
      upperOrgId,
      created.id,
      { name: "Uppercase Updated" }
    );
    expect(updated.name).toBe("Uppercase Updated");
  });

  it("handles concurrent delete and update without P2003", async () => {
    for (let i = 0; i < 5; i++) {
      const created = await repo.create({
        orgId,
        name: `Race Delete Update ${i}`,
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const [deleteResult, updateResult] = await Promise.allSettled([
        repo.delete(orgId, created.id),
        repo.update(orgId, created.id, {
          name: `Updated ${i}`,
          sessions: [
            { sessionType: "cuestas", dayOffset: 1 },
            { sessionType: "fartlek", dayOffset: 3 },
          ],
        }),
      ]);

      expect(deleteResult.status).toBe("fulfilled");
      if (updateResult.status === "rejected") {
        expect(updateResult.reason).toBeInstanceOf(TrainingNotFoundError);
      }
      expect(await repo.findById(created.id)).toBeNull();
    }
  });

  it("serializes concurrent updates without P2002", async () => {
    for (let i = 0; i < 5; i++) {
      const created = await repo.create({
        orgId,
        name: `Race Updates ${i}`,
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const [resA, resB] = await Promise.allSettled([
        repo.update(orgId, created.id, {
          name: "Winner A",
          sessions: [
            { sessionType: "intervalos", dayOffset: 1 },
            { sessionType: "cuestas", dayOffset: 2 },
          ],
        }),
        repo.update(orgId, created.id, {
          name: "Winner B",
          sessions: [
            { sessionType: "fartlek", dayOffset: 4 },
            { sessionType: "tirada_larga", dayOffset: 6 },
          ],
        }),
      ]);

      expect(resA.status).toBe("fulfilled");
      expect(resB.status).toBe("fulfilled");

      const finalTemplate = await repo.findById(created.id);
      expect(finalTemplate).not.toBeNull();
      expect(["Winner A", "Winner B"]).toContain(finalTemplate?.name);
      expect(finalTemplate?.sessions).toHaveLength(2);
      if (finalTemplate?.name === "Winner A") {
        expect(finalTemplate.sessions.map((s) => s.sessionType)).toEqual([
          "intervalos",
          "cuestas",
        ]);
      } else {
        expect(finalTemplate?.sessions.map((s) => s.sessionType)).toEqual([
          "fartlek",
          "tirada_larga",
        ]);
      }
    }
  });

  it("handles concurrent deletes without P2025", async () => {
    for (let i = 0; i < 5; i++) {
      const created = await repo.create({
        orgId,
        name: `Race Deletes ${i}`,
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const results = await Promise.allSettled([
        repo.delete(orgId, created.id),
        repo.delete(orgId, created.id),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(TrainingNotFoundError);
      expect(await repo.findById(created.id)).toBeNull();
    }
  });
});
