import type { SessionOrigin, SessionType } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { TrainingConflictError, TrainingNotFoundError } from "@/lib/training/errors";
import type {
  TrainingRepository,
  TrainingSessionData,
} from "@/lib/training/types";
import { computeScheduledAtUtc } from "@/lib/training/units";

const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface SeedSessionInput {
  orgId: string;
  origin: SessionOrigin;
  sessionType: SessionType;
  scheduledAt: Date;
  groupId?: string | null;
  athleteId?: string | null;
  sourceTemplateId?: string | null;
  customizesSessionId?: string | null;
  targetDistanceM?: number | null;
  targetDurationS?: number | null;
  targetPaceSPerKm?: number | null;
}

export interface TrainingRepositoryFixture {
  repo: TrainingRepository;
  orgId: string;
  otherOrgId: string;
  manager1Id: string;
  manager2Id: string;
  athleteId: string;
  secondAthleteId: string;
  groupId: string;
  secondGroupId: string;
  emptyGroupId: string;
  otherOrgGroupId: string;
  seedTemplateAssignment(groupId: string, templateId: string): Promise<void>;
  seedSession(input: SeedSessionInput): Promise<TrainingSessionData>;
  seedSessionLog(sessionId: string, athleteId: string): Promise<void>;
}

/** Shared contract suite run against both InMemoryTrainingRepository and PrismaTrainingRepository. */
export function runTrainingRepositoryContract(
  name: string,
  getFixture: () => TrainingRepositoryFixture
) {
  describe(`TrainingRepository contract: ${name}`, () => {
    it("finds role and other manager IDs", async () => {
      const { repo, orgId, otherOrgId, manager1Id, manager2Id, athleteId } =
        getFixture();

      expect(await repo.findRole(orgId, manager1Id)).toBe("manager");
      expect(await repo.findRole(orgId, athleteId)).toBe("athlete");
      expect(await repo.findRole(otherOrgId, manager1Id)).toBeNull();

      const otherManagers = await repo.findOtherManagerIds(orgId, manager1Id);
      expect(otherManagers).toEqual([manager2Id]);
    });

    it("creates template with reindexed session positions", async () => {
      const { repo, orgId, manager1Id } = getFixture();

      const template = await repo.create({
        orgId,
        name: "10K Base",
        createdBy: manager1Id,
        sessions: [
          { sessionType: "rodaje", dayOffset: 0, targetDistanceM: 5000 },
          { sessionType: "intervalos", dayOffset: 2, targetDistanceM: 8000 },
        ],
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe("10K Base");
      expect(template.sessions).toHaveLength(2);
      expect(template.sessions[0].position).toBe(0);
      expect(template.sessions[1].position).toBe(1);

      const found = await repo.findById(template.id);
      expect(found).toEqual(template);
    });

    it("lists all templates for manager and only assigned templates for athlete", async () => {
      const {
        repo,
        orgId,
        manager1Id,
        manager2Id,
        athleteId,
        groupId,
        seedTemplateAssignment,
      } = getFixture();

      const t1 = await repo.create({
        orgId,
        name: "Marathon Prep",
        createdBy: manager1Id,
        sessions: [
          {
            sessionType: "tirada_larga",
            dayOffset: 6,
            targetDistanceM: 20000,
          },
        ],
      });
      const t2 = await repo.create({
        orgId,
        name: "5K Speed",
        createdBy: manager2Id,
        sessions: [
          { sessionType: "fartlek", dayOffset: 1, targetDurationS: 2400 },
        ],
      });

      const managerList = await repo.listForManager(orgId);
      expect(managerList.map((t) => t.id)).toEqual(
        expect.arrayContaining([t1.id, t2.id])
      );

      expect(await repo.listForAthlete(orgId, athleteId)).toHaveLength(0);

      await seedTemplateAssignment(groupId, t1.id);

      const athleteList = await repo.listForAthlete(orgId, athleteId);
      expect(athleteList).toHaveLength(1);
      expect(athleteList[0].id).toBe(t1.id);
    });

    it("updates template name and sessions reindexing position", async () => {
      const { repo, orgId, manager1Id } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Initial Name",
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const updated = await repo.update(orgId, template.id, {
        name: "Updated Name",
        sessions: [
          { sessionType: "cuestas", dayOffset: 3 },
          { sessionType: "fartlek", dayOffset: 5 },
        ],
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.sessions).toHaveLength(2);
      expect(updated.sessions[0].sessionType).toBe("cuestas");
      expect(updated.sessions[0].position).toBe(0);
      expect(updated.sessions[1].sessionType).toBe("fartlek");
      expect(updated.sessions[1].position).toBe(1);
    });

    it("throws TrainingNotFoundError when updating or deleting missing or other-club template", async () => {
      const { repo, orgId, otherOrgId, manager1Id } = getFixture();

      const created = await repo.create({
        orgId,
        name: "Club A Plan",
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        repo.update(otherOrgId, created.id, { name: "Hijack" })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(repo.delete(otherOrgId, created.id)).rejects.toThrow(
        TrainingNotFoundError
      );

      await expect(repo.delete(orgId, UNKNOWN_ID)).rejects.toThrow(
        TrainingNotFoundError
      );

      expect(await repo.findById(created.id)).not.toBeNull();
    });

    it("normalizes uppercase IDs consistently across reads and writes", async () => {
      const { repo, orgId, manager1Id } = getFixture();
      const upperOrgId = orgId.toUpperCase();

      expect(await repo.findRole(upperOrgId, manager1Id.toUpperCase())).toBe(
        "manager"
      );

      const created = await repo.create({
        orgId: upperOrgId,
        name: "Uppercase ID Plan",
        createdBy: manager1Id.toUpperCase(),
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      expect(created.orgId).toBe(orgId.toLowerCase());
      expect(await repo.findById(created.id.toUpperCase())).toEqual(created);
      expect(await repo.listForManager(upperOrgId)).toHaveLength(1);

      const updated = await repo.update(upperOrgId, created.id.toUpperCase(), {
        name: "Updated Uppercase",
      });
      expect(updated.name).toBe("Updated Uppercase");

      await repo.delete(upperOrgId, created.id.toUpperCase());
      expect(await repo.findById(created.id)).toBeNull();
    });

    it("rolls back create, update, and delete when afterWrite throws", async () => {
      const { repo, orgId, manager1Id } = getFixture();

      await expect(
        repo.create(
          {
            orgId,
            name: "Rolled Back Create",
            createdBy: manager1Id,
            sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
          },
          async () => {
            throw new Error("Simulated failure on create");
          }
        )
      ).rejects.toThrow("Simulated failure on create");
      expect(await repo.listForManager(orgId)).toHaveLength(0);

      const created = await repo.create({
        orgId,
        name: "Stable Name",
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        repo.update(orgId, created.id, { name: "Rolled Back Update" }, async () => {
          throw new Error("Simulated failure on update");
        })
      ).rejects.toThrow("Simulated failure on update");
      expect((await repo.findById(created.id))?.name).toBe("Stable Name");

      await expect(
        repo.delete(orgId, created.id, async () => {
          throw new Error("Simulated failure on delete");
        })
      ).rejects.toThrow("Simulated failure on delete");
      expect(await repo.findById(created.id)).not.toBeNull();
    });

    it("assigns template to group by value at club 00:00 and passes group athlete IDs to afterAssign", async () => {
      const { repo, orgId, manager1Id, athleteId, groupId } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Spring DST Block",
        createdBy: manager1Id,
        sessions: [
          {
            sessionType: "rodaje",
            dayOffset: 0,
            targetDistanceM: 8000,
            targetPaceSPerKm: 300,
            targetDurationS: 2400,
          },
          { sessionType: "tirada_larga", dayOffset: 3, targetDistanceM: 22000 },
        ],
      });

      const notifiedAthleteIds: string[] = [];
      const createdSessions = await repo.assignTemplateToGroup(
        {
          orgId,
          templateId: template.id,
          groupId,
          // Europe/Madrid switches CET (UTC+1) -> CEST (UTC+2) on 2026-03-29
          startDate: "2026-03-27",
        },
        async (athleteIds) => {
          notifiedAthleteIds.push(...athleteIds);
        }
      );

      expect(createdSessions).toHaveLength(2);
      expect(createdSessions[0]).toMatchObject({
        orgId,
        origin: "template",
        sessionType: "rodaje",
        targetDistanceM: 8000,
        targetPaceSPerKm: 300,
        targetDurationS: 2400,
        groupId,
        athleteId: null,
        sourceTemplateId: template.id,
        scheduledAt: new Date("2026-03-26T23:00:00.000Z"),
      });
      expect(createdSessions[1]).toMatchObject({
        orgId,
        origin: "template",
        sessionType: "tirada_larga",
        targetDistanceM: 22000,
        targetPaceSPerKm: null,
        targetDurationS: null,
        groupId,
        athleteId: null,
        sourceTemplateId: template.id,
        scheduledAt: new Date("2026-03-29T22:00:00.000Z"),
      });
      expect(notifiedAthleteIds).toEqual([athleteId]);
    });

    it("supports empty group, reassignment, and past startDate", async () => {
      const { repo, orgId, manager1Id, emptyGroupId, groupId } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Reusable Block",
        createdBy: manager1Id,
        sessions: [{ sessionType: "cuestas", dayOffset: 0, targetDurationS: 1800 }],
      });

      const emptyGroupNotified: string[] = [];
      const firstBatch = await repo.assignTemplateToGroup(
        {
          orgId,
          templateId: template.id,
          groupId: emptyGroupId,
          startDate: "2020-01-15",
        },
        async (athleteIds) => {
          emptyGroupNotified.push(...athleteIds);
        }
      );

      expect(firstBatch).toHaveLength(1);
      expect(firstBatch[0].groupId).toBe(emptyGroupId);
      expect(firstBatch[0].scheduledAt).toEqual(
        new Date("2020-01-14T23:00:00.000Z")
      );
      expect(emptyGroupNotified).toEqual([]);

      const batchA = await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: "2026-05-01",
      });
      const batchB = await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: "2026-05-08",
      });

      expect(batchA[0].id).not.toBe(batchB[0].id);
      expect(batchA[0].scheduledAt).not.toEqual(batchB[0].scheduledAt);
    });

    it("throws TrainingNotFoundError when template or group is missing or belongs to another club", async () => {
      const { repo, orgId, otherOrgId, manager1Id, groupId, otherOrgGroupId } =
        getFixture();

      const template = await repo.create({
        orgId,
        name: "Club A Plan",
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        repo.assignTemplateToGroup({
          orgId: otherOrgId,
          templateId: template.id,
          groupId: otherOrgGroupId,
          startDate: "2026-05-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        repo.assignTemplateToGroup({
          orgId,
          templateId: template.id,
          groupId: otherOrgGroupId,
          startDate: "2026-05-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        repo.assignTemplateToGroup({
          orgId,
          templateId: UNKNOWN_ID,
          groupId,
          startDate: "2026-05-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        repo.assignTemplateToGroup({
          orgId,
          templateId: template.id,
          groupId: UNKNOWN_ID,
          startDate: "2026-05-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);
    });

    it("rolls back created sessions when afterAssign throws", async () => {
      const { repo, orgId, manager1Id, athleteId, groupId } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Rollback Plan",
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        repo.assignTemplateToGroup(
          {
            orgId,
            templateId: template.id,
            groupId,
            startDate: "2026-05-01",
          },
          async () => {
            throw new Error("Simulated failure on assign");
          }
        )
      ).rejects.toThrow("Simulated failure on assign");

      expect(await repo.listForAthlete(orgId, athleteId)).toHaveLength(0);
    });

    it("rejects duplicate assignment for the same template, group, and startDate while allowing another startDate", async () => {
      const { repo, orgId, manager1Id, groupId } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Overlap & Duplicate Block",
        createdBy: manager1Id,
        sessions: [
          { sessionType: "rodaje", dayOffset: 0, targetDistanceM: 6000 },
          { sessionType: "tirada_larga", dayOffset: 3, targetDistanceM: 16000 },
        ],
      });

      let notifyCalls = 0;
      await repo.assignTemplateToGroup(
        {
          orgId,
          templateId: template.id,
          groupId,
          startDate: "2026-06-01",
        },
        async () => {
          notifyCalls += 1;
        }
      );
      expect(notifyCalls).toBe(1);

      // Exact same (templateId, groupId, startDate) is rejected without notifying again
      await expect(
        repo.assignTemplateToGroup(
          {
            orgId,
            templateId: template.id,
            groupId,
            startDate: "2026-06-01",
          },
          async () => {
            notifyCalls += 1;
          }
        )
      ).rejects.toThrow(TrainingConflictError);
      expect(notifyCalls).toBe(1);

      // Different startDate (even overlapping on 2026-06-04) is still allowed
      const overlappingBatch = await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: "2026-06-04",
      });
      expect(overlappingBatch).toHaveLength(2);
    });

    it("accepts today and future startDate values", async () => {
      const { repo, orgId, manager1Id, groupId } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Today & Future Plan",
        createdBy: manager1Id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0, targetDistanceM: 5000 }],
      });

      const now = new Date();
      const today = formatUtcDate(now);
      const future = formatUtcDate(
        new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30)
        )
      );

      const todayBatch = await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: today,
      });
      const futureBatch = await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: future,
      });

      expect(todayBatch).toHaveLength(1);
      expect(todayBatch[0].scheduledAt).toEqual(
        computeScheduledAtUtc(today, 0, "Europe/Madrid")
      );
      expect(futureBatch).toHaveLength(1);
      expect(futureBatch[0].scheduledAt).toEqual(
        computeScheduledAtUtc(future, 0, "Europe/Madrid")
      );
      expect(todayBatch[0].id).not.toBe(futureBatch[0].id);
    });

    it("documents known limit: rejects intermediate startDate when surrounding assignments already cover all planned signatures", async () => {
      const { repo, orgId, manager1Id, groupId } = getFixture();

      const template = await repo.create({
        orgId,
        name: "Periodic Weekly Rodaje",
        createdBy: manager1Id,
        sessions: [
          { sessionType: "rodaje", dayOffset: 0, targetDistanceM: 8000 },
          { sessionType: "rodaje", dayOffset: 7, targetDistanceM: 8000 },
        ],
      });

      // Creates 2026-06-01 and 2026-06-08
      await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: "2026-06-01",
      });
      // Creates 2026-06-15 and 2026-06-22
      await repo.assignTemplateToGroup({
        orgId,
        templateId: template.id,
        groupId,
        startDate: "2026-06-15",
      });

      // Known limit (#238): 2026-06-08 plans 2026-06-08 + 2026-06-15, which already exist
      // from the surrounding assignments, so signature-based duplicate detection rejects it.
      await expect(
        repo.assignTemplateToGroup({
          orgId,
          templateId: template.id,
          groupId,
          startDate: "2026-06-08",
        })
      ).rejects.toThrow(TrainingConflictError);
    });

    it("combines template sessions from multiple groups, customized, and free sessions in chronological order", async () => {
      const {
        repo,
        orgId,
        athleteId,
        groupId,
        secondGroupId,
        emptyGroupId,
        seedSession,
      } = getFixture();

      const freeSession = await seedSession({
        orgId,
        origin: "free",
        sessionType: "fartlek",
        scheduledAt: new Date("2026-07-03T08:00:00.000Z"),
        athleteId,
      });
      const group1Session = await seedSession({
        orgId,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-07-01T08:00:00.000Z"),
        groupId,
      });
      const customizedSession = await seedSession({
        orgId,
        origin: "customized",
        sessionType: "intervalos",
        scheduledAt: new Date("2026-07-02T08:00:00.000Z"),
        athleteId,
      });
      const group2Session = await seedSession({
        orgId,
        origin: "template",
        sessionType: "tirada_larga",
        scheduledAt: new Date("2026-07-04T08:00:00.000Z"),
        groupId: secondGroupId,
      });
      // Group the athlete does not belong to must not appear in their schedule
      await seedSession({
        orgId,
        origin: "template",
        sessionType: "cuestas",
        scheduledAt: new Date("2026-07-02T12:00:00.000Z"),
        groupId: emptyGroupId,
      });

      const schedule = await repo.getAthleteSchedule(orgId, athleteId);

      expect(schedule.map((s) => s.id)).toEqual([
        group1Session.id,
        customizedSession.id,
        freeSession.id,
        group2Session.id,
      ]);
      expect(schedule[0].groupId).toBe(groupId);
      expect(schedule[3].groupId).toBe(secondGroupId);
    });

    it("substitutes group session with Customized Session unless the athlete already logged that group session", async () => {
      const {
        repo,
        orgId,
        athleteId,
        secondAthleteId,
        secondGroupId,
        seedSession,
        seedSessionLog,
      } = getFixture();

      // Group session A: adapted for athleteId, logged only by secondAthleteId
      const groupSessionA = await seedSession({
        orgId,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-07-10T08:00:00.000Z"),
        groupId: secondGroupId,
      });
      await seedSessionLog(groupSessionA.id, secondAthleteId);

      const customizedForA = await seedSession({
        orgId,
        origin: "customized",
        sessionType: "rodaje",
        targetDistanceM: 6000,
        scheduledAt: new Date("2026-07-10T09:00:00.000Z"),
        athleteId,
        customizesSessionId: groupSessionA.id,
      });

      // Group session B: athleteId already has a SessionLog, so it must stay visible
      const groupSessionB = await seedSession({
        orgId,
        origin: "template",
        sessionType: "intervalos",
        scheduledAt: new Date("2026-07-11T08:00:00.000Z"),
        groupId: secondGroupId,
      });
      await seedSessionLog(groupSessionB.id, athleteId);

      const customizedForB = await seedSession({
        orgId,
        origin: "customized",
        sessionType: "intervalos",
        scheduledAt: new Date("2026-07-11T09:00:00.000Z"),
        athleteId,
        customizesSessionId: groupSessionB.id,
      });

      const athleteSchedule = await repo.getAthleteSchedule(orgId, athleteId);
      expect(athleteSchedule.map((s) => s.id)).toEqual([
        customizedForA.id,
        groupSessionB.id,
        customizedForB.id,
      ]);

      // Teammate in the same group still sees both original group sessions
      const peerSchedule = await repo.getAthleteSchedule(orgId, secondAthleteId);
      expect(peerSchedule.map((s) => s.id)).toEqual([
        groupSessionA.id,
        groupSessionB.id,
      ]);
    });

    it("lists all club sessions (template, customized, free) in chronological order and excludes other clubs", async () => {
      const {
        repo,
        orgId,
        otherOrgId,
        athleteId,
        secondAthleteId,
        groupId,
        otherOrgGroupId,
        seedSession,
      } = getFixture();

      const freeSession = await seedSession({
        orgId,
        origin: "free",
        sessionType: "fartlek",
        scheduledAt: new Date("2026-08-03T08:00:00.000Z"),
        athleteId,
      });
      const groupSession = await seedSession({
        orgId,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-08-01T08:00:00.000Z"),
        groupId,
      });
      const customizedSession = await seedSession({
        orgId,
        origin: "customized",
        sessionType: "cuestas",
        scheduledAt: new Date("2026-08-02T08:00:00.000Z"),
        athleteId: secondAthleteId,
      });
      // Session in another club must never leak into orgId
      await seedSession({
        orgId: otherOrgId,
        origin: "template",
        sessionType: "tirada_larga",
        scheduledAt: new Date("2026-08-02T00:00:00.000Z"),
        groupId: otherOrgGroupId,
      });

      const clubSessions = await repo.listClubSessions(orgId);

      expect(clubSessions.map((s) => s.id)).toEqual([
        groupSession.id,
        customizedSession.id,
        freeSession.id,
      ]);
    });
  });
}
