import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryTrainingRepository,
  IN_MEMORY_TX_TOKEN,
} from "../../support/in-memory-training-repository";
import { TrainingService } from "@/lib/training/training-service";
import {
  SESSION_ALREADY_LOGGED,
  TrainingConflictError,
  TrainingForbiddenError,
  TrainingNotFoundError,
  TrainingValidationError,
} from "@/lib/training/errors";
import {
  CUSTOMIZED_SESSION_CREATED,
  CUSTOMIZED_SESSION_DELETED,
  CUSTOMIZED_SESSION_UPDATED,
  TRAINING_SESSION_DELETED,
  TRAINING_SESSION_UPDATED,
  TRAINING_TEMPLATE_ASSIGNED,
  TRAINING_TEMPLATE_CREATED,
  TRAINING_TEMPLATE_DELETED,
  TRAINING_TEMPLATE_UPDATED,
  type TrainingNotifyInput,
} from "@/lib/training/types";

describe("TrainingService", () => {
  let repo: InMemoryTrainingRepository;
  let service: TrainingService;
  let notifiedCalls: Array<{ tx: unknown; input: TrainingNotifyInput }>;

  const ORG_A = "13400000-0000-4000-8000-000000000001";
  const ORG_OTHER = "13400000-0000-4000-8000-000000000099";
  const MANAGER_1 = "13400000-0000-4000-8000-000000000011";
  const MANAGER_2 = "13400000-0000-4000-8000-000000000012";
  const MANAGER_3 = "13400000-0000-4000-8000-000000000013";
  const ATHLETE_1 = "13400000-0000-4000-8000-000000000021";
  const STRANGER = "13400000-0000-4000-8000-000000000031";
  const GROUP_1 = "13400000-0000-4000-8000-000000000041";

  beforeEach(() => {
    repo = new InMemoryTrainingRepository();
    notifiedCalls = [];
    const mockNotifier = vi.fn(
      async (tx: unknown, input: TrainingNotifyInput): Promise<bigint | null> => {
        notifiedCalls.push({ tx, input });
        return BigInt(notifiedCalls.length);
      }
    );

    service = new TrainingService(repo, mockNotifier);

    repo.addMember(ORG_A, MANAGER_1, "manager");
    repo.addMember(ORG_A, MANAGER_2, "manager");
    repo.addMember(ORG_A, ATHLETE_1, "athlete");
    repo.addGroup(ORG_A, GROUP_1);
    repo.addAthleteToGroup(ATHLETE_1, GROUP_1);
  });

  describe("listTemplates and getTemplate", () => {
    it("returns all templates for manager and only assigned for athlete", async () => {
      const t1 = await repo.create({
        orgId: ORG_A,
        name: "Plantilla 1",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });
      const t2 = await repo.create({
        orgId: ORG_A,
        name: "Plantilla 2",
        createdBy: MANAGER_2,
        sessions: [{ sessionType: "fartlek", dayOffset: 1 }],
      });

      // Manager sees both
      const managerTemplates = await service.listTemplates(MANAGER_1, ORG_A);
      expect(managerTemplates).toHaveLength(2);
      expect(managerTemplates.map((t) => t.id)).toEqual(
        expect.arrayContaining([t1.id, t2.id])
      );

      // Athlete sees none before assignment
      const athleteBefore = await service.listTemplates(ATHLETE_1, ORG_A);
      expect(athleteBefore).toHaveLength(0);

      // Athlete gets 404 if trying to read an unassigned template directly
      await expect(service.getTemplate(ATHLETE_1, ORG_A, t1.id)).rejects.toThrow(
        TrainingNotFoundError
      );

      // Assign t1 to Athlete's group
      repo.seedTemplateAssignment(GROUP_1, t1.id);

      const athleteAfter = await service.listTemplates(ATHLETE_1, ORG_A);
      expect(athleteAfter).toHaveLength(1);
      expect(athleteAfter[0].id).toBe(t1.id);

      // Now Athlete can get t1
      const athleteT1 = await service.getTemplate(ATHLETE_1, ORG_A, t1.id);
      expect(athleteT1.id).toBe(t1.id);
    });

    it("throws 404 if actor is not member of the club", async () => {
      await expect(service.listTemplates(STRANGER, ORG_A)).rejects.toThrow(
        TrainingNotFoundError
      );
    });

    it("throws 404 if template belongs to another club", async () => {
      const otherOrgTemplate = await repo.create({
        orgId: ORG_OTHER,
        name: "Other Org Template",
        createdBy: STRANGER,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        service.getTemplate(MANAGER_1, ORG_A, otherOrgTemplate.id)
      ).rejects.toThrow(TrainingNotFoundError);
    });
  });

  describe("createTemplate", () => {
    it("allows manager to create template and notifies other managers with only IDs", async () => {
      const created = await service.createTemplate(MANAGER_1, ORG_A, {
        name: "Media Maratón Sub 1:45",
        sessions: [
          { sessionType: "rodaje", dayOffset: 1, targetDistanceM: 8000 },
          { sessionType: "intervalos", dayOffset: 3, targetDistanceM: 10000 },
        ],
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Media Maratón Sub 1:45");
      expect(created.sessions).toHaveLength(2);
      expect(created.sessions[0].position).toBe(0);
      expect(created.sessions[1].position).toBe(1);

      // Notification check
      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].tx).toBe(IN_MEMORY_TX_TOKEN);
      expect(notifiedCalls[0].input).toEqual({
        userId: MANAGER_2,
        type: TRAINING_TEMPLATE_CREATED,
        payload: {
          orgId: ORG_A,
          templateId: created.id,
        },
      });
      // Verify payload contains only *Id keys and NO health data or feedback
      expect(
        Object.keys(notifiedCalls[0].input.payload).every((key) =>
          key.endsWith("Id")
        )
      ).toBe(true);
    });

    it("notifies each other manager once and skips when actor is the only manager", async () => {
      repo.addMember(ORG_A, MANAGER_3, "manager");

      const created = await service.createTemplate(MANAGER_1, ORG_A, {
        name: "Multi-Manager Plan",
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      expect(notifiedCalls).toHaveLength(2);
      expect(notifiedCalls.map((call) => call.input.userId)).toEqual(
        expect.arrayContaining([MANAGER_2, MANAGER_3])
      );
      for (const call of notifiedCalls) {
        expect(call.tx).toBe(IN_MEMORY_TX_TOKEN);
        expect(call.input.type).toBe(TRAINING_TEMPLATE_CREATED);
        expect(call.input.payload).toEqual({
          orgId: ORG_A,
          templateId: created.id,
        });
      }

      notifiedCalls.length = 0;
      const soloRepo = new InMemoryTrainingRepository();
      soloRepo.addMember(ORG_A, MANAGER_1, "manager");
      const soloService = new TrainingService(soloRepo, async (tx, input) => {
        notifiedCalls.push({ tx, input });
        return BigInt(1);
      });

      await soloService.createTemplate(MANAGER_1, ORG_A, {
        name: "Solo Manager Plan",
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      expect(notifiedCalls).toHaveLength(0);
    });

    it("rolls back template creation if transactional notifier throws", async () => {
      const failingService = new TrainingService(repo, async () => {
        throw new Error("Notification failure");
      });

      await expect(
        failingService.createTemplate(MANAGER_1, ORG_A, {
          name: "Rolled back plan",
          sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
        })
      ).rejects.toThrow("Notification failure");

      expect(await repo.listForManager(ORG_A)).toHaveLength(0);
    });

    it("rejects athlete with 403 Forbidden", async () => {
      await expect(
        service.createTemplate(ATHLETE_1, ORG_A, {
          name: "Intento Atleta",
          sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
        })
      ).rejects.toThrow(TrainingForbiddenError);
    });

    it("rejects non-member with 404 NotFound", async () => {
      await expect(
        service.createTemplate(STRANGER, ORG_A, {
          name: "Intento Extraño",
          sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
        })
      ).rejects.toThrow(TrainingNotFoundError);
    });

    it("rejects empty name or empty sessions list with 400 ValidationError", async () => {
      await expect(
        service.createTemplate(MANAGER_1, ORG_A, {
          name: "  ",
          sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
        })
      ).rejects.toThrow(TrainingValidationError);

      await expect(
        service.createTemplate(MANAGER_1, ORG_A, {
          name: "Sin sesiones",
          sessions: [],
        })
      ).rejects.toThrow(TrainingValidationError);
    });
  });

  describe("updateTemplate", () => {
    it("allows manager to update name and sessions and notifies other managers", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "Old Name",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const updated = await service.updateTemplate(MANAGER_1, ORG_A, template.id, {
        name: "New Name",
        sessions: [
          { sessionType: "cuestas", dayOffset: 2 },
          { sessionType: "fartlek", dayOffset: 4 },
        ],
      });

      expect(updated.name).toBe("New Name");
      expect(updated.sessions).toHaveLength(2);
      expect(updated.sessions[0].sessionType).toBe("cuestas");
      expect(updated.sessions[0].position).toBe(0);
      expect(updated.sessions[1].sessionType).toBe("fartlek");
      expect(updated.sessions[1].position).toBe(1);

      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].tx).toBe(IN_MEMORY_TX_TOKEN);
      expect(notifiedCalls[0].input).toEqual({
        userId: MANAGER_2,
        type: TRAINING_TEMPLATE_UPDATED,
        payload: {
          orgId: ORG_A,
          templateId: template.id,
        },
      });
    });

    it("allows a different manager of the same club to update a template created by another manager", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "Created by Manager 1",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const updated = await service.updateTemplate(MANAGER_2, ORG_A, template.id, {
        name: "Edited by Manager 2",
      });

      expect(updated.name).toBe("Edited by Manager 2");
      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].input).toEqual({
        userId: MANAGER_1,
        type: TRAINING_TEMPLATE_UPDATED,
        payload: {
          orgId: ORG_A,
          templateId: template.id,
        },
      });
    });

    it("rejects athlete with 403 Forbidden", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "Old Name",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        service.updateTemplate(ATHLETE_1, ORG_A, template.id, { name: "Hack" })
      ).rejects.toThrow(TrainingForbiddenError);
    });
  });

  describe("deleteTemplate", () => {
    it("allows manager to delete template and notifies other managers", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "To Delete",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await service.deleteTemplate(MANAGER_1, ORG_A, template.id);

      expect(await repo.findById(template.id)).toBeNull();

      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].tx).toBe(IN_MEMORY_TX_TOKEN);
      expect(notifiedCalls[0].input).toEqual({
        userId: MANAGER_2,
        type: TRAINING_TEMPLATE_DELETED,
        payload: {
          orgId: ORG_A,
          templateId: template.id,
        },
      });
    });

    it("allows a different manager of the same club to delete a template created by another manager", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "Created by Manager 1",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await service.deleteTemplate(MANAGER_2, ORG_A, template.id);

      expect(await repo.findById(template.id)).toBeNull();
      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].input).toEqual({
        userId: MANAGER_1,
        type: TRAINING_TEMPLATE_DELETED,
        payload: {
          orgId: ORG_A,
          templateId: template.id,
        },
      });
    });

    it("rejects athlete with 403 Forbidden", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "Template",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        service.deleteTemplate(ATHLETE_1, ORG_A, template.id)
      ).rejects.toThrow(TrainingForbiddenError);
    });
  });

  describe("assignTemplateToGroup", () => {
    it("allows manager to assign template to group and notifies group athletes with IDs only", async () => {
      const template = await repo.create({
        orgId: ORG_A,
        name: "Base 10K",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0, targetDistanceM: 7000 }],
      });
      notifiedCalls = [];

      const created = await service.assignTemplateToGroup(MANAGER_1, ORG_A, {
        templateId: template.id,
        groupId: GROUP_1,
        startDate: "2026-06-01",
      });

      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        orgId: ORG_A,
        origin: "template",
        groupId: GROUP_1,
        athleteId: null,
        sourceTemplateId: template.id,
      });

      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].tx).toBe(IN_MEMORY_TX_TOKEN);
      expect(notifiedCalls[0].input).toEqual({
        userId: ATHLETE_1,
        type: TRAINING_TEMPLATE_ASSIGNED,
        payload: {
          orgId: ORG_A,
          templateId: template.id,
          groupId: GROUP_1,
        },
      });
    });

    it("sends zero notifications when group is empty and rolls back when notifier throws", async () => {
      const EMPTY_GROUP = "13400000-0000-4000-8000-000000000042";
      repo.addGroup(ORG_A, EMPTY_GROUP);

      const template = await repo.create({
        orgId: ORG_A,
        name: "Empty Group Plan",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });
      notifiedCalls = [];

      const created = await service.assignTemplateToGroup(MANAGER_1, ORG_A, {
        templateId: template.id,
        groupId: EMPTY_GROUP,
        startDate: "2026-06-01",
      });

      expect(created).toHaveLength(1);
      expect(notifiedCalls).toHaveLength(0);

      const failingService = new TrainingService(repo, async () => {
        throw new Error("Notification service down");
      });

      await expect(
        failingService.assignTemplateToGroup(MANAGER_1, ORG_A, {
          templateId: template.id,
          groupId: GROUP_1,
          startDate: "2026-06-01",
        })
      ).rejects.toThrow("Notification service down");

      expect(await repo.listForAthlete(ORG_A, ATHLETE_1)).toHaveLength(0);
    });

    it("rejects athlete with 403, non-member or cross-org with 404, and invalid startDate with 400", async () => {
      const OTHER_GROUP = "13400000-0000-4000-8000-000000000043";
      repo.addGroup(ORG_OTHER, OTHER_GROUP);

      const template = await repo.create({
        orgId: ORG_A,
        name: "Auth & Validation Plan",
        createdBy: MANAGER_1,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });
      const otherTemplate = await repo.create({
        orgId: ORG_OTHER,
        name: "Other Club Plan",
        createdBy: STRANGER,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        service.assignTemplateToGroup(ATHLETE_1, ORG_A, {
          templateId: template.id,
          groupId: GROUP_1,
          startDate: "2026-06-01",
        })
      ).rejects.toThrow(TrainingForbiddenError);

      await expect(
        service.assignTemplateToGroup(STRANGER, ORG_A, {
          templateId: template.id,
          groupId: GROUP_1,
          startDate: "2026-06-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.assignTemplateToGroup(MANAGER_1, ORG_A, {
          templateId: template.id,
          groupId: OTHER_GROUP,
          startDate: "2026-06-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.assignTemplateToGroup(MANAGER_1, ORG_A, {
          templateId: otherTemplate.id,
          groupId: GROUP_1,
          startDate: "2026-06-01",
        })
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.assignTemplateToGroup(MANAGER_1, ORG_A, {
          templateId: template.id,
          groupId: GROUP_1,
          startDate: "2026-02-30",
        })
      ).rejects.toThrow(TrainingValidationError);
    });
  });

  describe("getAthleteSchedule", () => {
    it("returns the athlete's own chronological schedule with substitution and allows a manager to view it", async () => {
      const groupSession = repo.seedSession({
        orgId: ORG_A,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-09-01T08:00:00.000Z"),
        groupId: GROUP_1,
      });
      const customizedSession = repo.seedSession({
        orgId: ORG_A,
        origin: "customized",
        sessionType: "rodaje",
        targetDistanceM: 5000,
        scheduledAt: new Date("2026-09-01T09:00:00.000Z"),
        athleteId: ATHLETE_1,
        customizesSessionId: groupSession.id,
      });
      const freeSession = repo.seedSession({
        orgId: ORG_A,
        origin: "free",
        sessionType: "fartlek",
        scheduledAt: new Date("2026-09-02T08:00:00.000Z"),
        athleteId: ATHLETE_1,
      });

      const ownSchedule = await service.getAthleteSchedule(ATHLETE_1, ORG_A);
      expect(ownSchedule.map((s) => s.id)).toEqual([
        customizedSession.id,
        freeSession.id,
      ]);

      const managerView = await service.getAthleteSchedule(
        MANAGER_1,
        ORG_A,
        ATHLETE_1
      );
      expect(managerView.map((s) => s.id)).toEqual([
        customizedSession.id,
        freeSession.id,
      ]);
    });

    it("rejects non-members, cross-athlete access, and non-athlete targets with 404", async () => {
      const ATHLETE_2 = "13400000-0000-4000-8000-000000000022";
      repo.addMember(ORG_A, ATHLETE_2, "athlete");

      await expect(
        service.getAthleteSchedule(ATHLETE_1, ORG_A, ATHLETE_2)
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.getAthleteSchedule(ATHLETE_1, ORG_A, "")
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.getAthleteSchedule(STRANGER, ORG_A)
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.getAthleteSchedule(MANAGER_1, ORG_A, STRANGER)
      ).rejects.toThrow(TrainingNotFoundError);

      await expect(
        service.getAthleteSchedule(MANAGER_1, ORG_A, MANAGER_2)
      ).rejects.toThrow(TrainingNotFoundError);
    });
  });

  describe("listClubSessions", () => {
    it("allows a manager to list template, customized, and free sessions of their club only", async () => {
      const groupSession = repo.seedSession({
        orgId: ORG_A,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-09-10T08:00:00.000Z"),
        groupId: GROUP_1,
      });
      const customizedSession = repo.seedSession({
        orgId: ORG_A,
        origin: "customized",
        sessionType: "intervalos",
        scheduledAt: new Date("2026-09-11T08:00:00.000Z"),
        athleteId: ATHLETE_1,
      });
      const freeSession = repo.seedSession({
        orgId: ORG_A,
        origin: "free",
        sessionType: "cuestas",
        scheduledAt: new Date("2026-09-12T08:00:00.000Z"),
        athleteId: ATHLETE_1,
      });
      repo.seedSession({
        orgId: ORG_OTHER,
        origin: "free",
        sessionType: "fartlek",
        scheduledAt: new Date("2026-09-10T07:00:00.000Z"),
        athleteId: STRANGER,
      });

      const sessions = await service.listClubSessions(MANAGER_1, ORG_A);
      expect(sessions.map((s) => s.id)).toEqual([
        groupSession.id,
        customizedSession.id,
        freeSession.id,
      ]);
    });

    it("rejects athlete with 403 Forbidden and non-member with 404 NotFound", async () => {
      await expect(
        service.listClubSessions(ATHLETE_1, ORG_A)
      ).rejects.toThrow(TrainingForbiddenError);

      await expect(
        service.listClubSessions(STRANGER, ORG_A)
      ).rejects.toThrow(TrainingNotFoundError);
    });
  });

  describe("createCustomizedSession, updateManagerSession, and deleteManagerSession", () => {
    const ATHLETE_2 = "13400000-0000-4000-8000-000000000022";

    it("notifies target athlete on Customized Session CRUD with IDs only and notifies non-substituted group athletes on group session update/delete", async () => {
      repo.addMember(ORG_A, ATHLETE_2, "athlete");
      repo.addAthleteToGroup(ATHLETE_2, GROUP_1);

      const groupSession = repo.seedSession({
        orgId: ORG_A,
        origin: "template",
        sessionType: "rodaje",
        targetDistanceM: 10000,
        scheduledAt: new Date("2026-10-01T08:00:00.000Z"),
        groupId: GROUP_1,
      });

      const created = await service.createCustomizedSession(MANAGER_1, ORG_A, {
        athleteId: ATHLETE_1,
        customizesSessionId: groupSession.id,
        sessionType: "rodaje",
        scheduledAt: "2026-10-01",
        targetDistanceM: 6000,
      });
      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].tx).toBe(IN_MEMORY_TX_TOKEN);
      expect(notifiedCalls[0].input).toEqual({
        userId: ATHLETE_1,
        type: CUSTOMIZED_SESSION_CREATED,
        payload: {
          orgId: ORG_A,
          sessionId: created.id,
          athleteId: ATHLETE_1,
        },
      });

      // Updating groupSession notifies only ATHLETE_2 (ATHLETE_1 has a substitution)
      notifiedCalls = [];
      const updatedGroup = await service.updateManagerSession(
        MANAGER_1,
        ORG_A,
        groupSession.id,
        { sessionType: "intervalos", targetDistanceM: 12000 }
      );
      expect(updatedGroup.sessionType).toBe("intervalos");
      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].input).toEqual({
        userId: ATHLETE_2,
        type: TRAINING_SESSION_UPDATED,
        payload: {
          orgId: ORG_A,
          sessionId: groupSession.id,
          groupId: GROUP_1,
        },
      });

      // Deleting groupSession also notifies only ATHLETE_2
      notifiedCalls = [];
      await service.deleteManagerSession(MANAGER_1, ORG_A, groupSession.id);
      expect(notifiedCalls).toHaveLength(1);
      expect(notifiedCalls[0].input).toEqual({
        userId: ATHLETE_2,
        type: TRAINING_SESSION_DELETED,
        payload: {
          orgId: ORG_A,
          sessionId: groupSession.id,
          groupId: GROUP_1,
        },
      });

      // Updating and deleting the Customized Session notifies ATHLETE_1
      notifiedCalls = [];
      await service.updateManagerSession(MANAGER_1, ORG_A, created.id, {
        targetDistanceM: 7000,
      });
      await service.deleteManagerSession(MANAGER_1, ORG_A, created.id);
      expect(notifiedCalls.map((c) => c.input)).toEqual([
        {
          userId: ATHLETE_1,
          type: CUSTOMIZED_SESSION_UPDATED,
          payload: {
            orgId: ORG_A,
            sessionId: created.id,
            athleteId: ATHLETE_1,
          },
        },
        {
          userId: ATHLETE_1,
          type: CUSTOMIZED_SESSION_DELETED,
          payload: {
            orgId: ORG_A,
            sessionId: created.id,
            athleteId: ATHLETE_1,
          },
        },
      ]);
      for (const call of notifiedCalls) {
        expect(
          Object.keys(call.input.payload).every((key) => key.endsWith("Id"))
        ).toBe(true);
      }
    });

    it("emits zero notifications when deleting an orphan template session whose group was deleted", async () => {
      const orphanSession = repo.seedSession({
        orgId: ORG_A,
        origin: "template",
        sessionType: "cuestas",
        scheduledAt: new Date("2026-10-05T08:00:00.000Z"),
        groupId: GROUP_1,
      });
      repo.deleteGroup(GROUP_1);

      await service.deleteManagerSession(MANAGER_1, ORG_A, orphanSession.id);
      expect(notifiedCalls).toHaveLength(0);
    });

    it("enforces role permissions (403 athlete, 404 outsider, 403 manager on free session) and validation/conflict errors", async () => {
      const groupSession = repo.seedSession({
        orgId: ORG_A,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-10-10T08:00:00.000Z"),
        groupId: GROUP_1,
      });
      const freeSession = repo.seedSession({
        orgId: ORG_A,
        origin: "free",
        sessionType: "fartlek",
        scheduledAt: new Date("2026-10-11T08:00:00.000Z"),
        athleteId: ATHLETE_1,
      });

      await expect(
        service.createCustomizedSession(ATHLETE_1, ORG_A, {
          athleteId: ATHLETE_1,
          sessionType: "rodaje",
          scheduledAt: "2026-10-12",
        })
      ).rejects.toThrow(TrainingForbiddenError);
      await expect(
        service.updateManagerSession(ATHLETE_1, ORG_A, groupSession.id, {
          sessionType: "cuestas",
        })
      ).rejects.toThrow(TrainingForbiddenError);
      await expect(
        service.deleteManagerSession(ATHLETE_1, ORG_A, groupSession.id)
      ).rejects.toThrow(TrainingForbiddenError);

      await expect(
        service.createCustomizedSession(STRANGER, ORG_A, {
          athleteId: ATHLETE_1,
          sessionType: "rodaje",
          scheduledAt: "2026-10-12",
        })
      ).rejects.toThrow(TrainingNotFoundError);
      await expect(
        service.updateManagerSession(STRANGER, ORG_A, groupSession.id, {
          sessionType: "cuestas",
        })
      ).rejects.toThrow(TrainingNotFoundError);
      await expect(
        service.deleteManagerSession(STRANGER, ORG_A, groupSession.id)
      ).rejects.toThrow(TrainingNotFoundError);

      // Manager cannot edit/delete Free Session (403)
      await expect(
        service.updateManagerSession(MANAGER_1, ORG_A, freeSession.id, {
          sessionType: "rodaje",
        })
      ).rejects.toThrow(TrainingForbiddenError);
      await expect(
        service.deleteManagerSession(MANAGER_1, ORG_A, freeSession.id)
      ).rejects.toThrow(TrainingForbiddenError);

      // Empty update fails validation (400)
      await expect(
        service.updateManagerSession(MANAGER_1, ORG_A, groupSession.id, {})
      ).rejects.toThrow(TrainingValidationError);

      // Logged session returns 409 SESSION_ALREADY_LOGGED
      repo.seedSessionLog(groupSession.id, ATHLETE_1);
      await expect(
        service.updateManagerSession(MANAGER_1, ORG_A, groupSession.id, {
          sessionType: "cuestas",
        })
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof TrainingConflictError &&
          err.code === SESSION_ALREADY_LOGGED
      );
    });
  });
});
