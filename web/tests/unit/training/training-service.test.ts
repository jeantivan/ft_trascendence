import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryTrainingRepository } from "../../support/in-memory-training-repository";
import { TrainingService } from "@/lib/training/training-service";
import {
  TrainingForbiddenError,
  TrainingNotFoundError,
  TrainingValidationError,
} from "@/lib/training/errors";
import type { TrainingNotificationPayload } from "@/lib/training/types";

describe("TrainingService", () => {
  let repo: InMemoryTrainingRepository;
  let service: TrainingService;
  let notifiedPayloads: TrainingNotificationPayload[];

  const ORG_A = "org-1111-1111-1111-111111111111";
  const ORG_OTHER = "org-9999-9999-9999-999999999999";
  const MANAGER_1 = "usr-mgr1-1111-1111-111111111111";
  const MANAGER_2 = "usr-mgr2-2222-2222-222222222222";
  const ATHLETE_1 = "usr-ath1-3333-3333-333333333333";
  const STRANGER = "usr-stranger-0000-000000000000";
  const GROUP_1 = "grp-1111-1111-1111-111111111111";

  beforeEach(() => {
    repo = new InMemoryTrainingRepository();
    notifiedPayloads = [];
    const mockNotifier = vi.fn(async (payload: TrainingNotificationPayload) => {
      notifiedPayloads.push(payload);
    });

    service = new TrainingService(repo, mockNotifier);

    repo.addMember(ORG_A, MANAGER_1, "manager");
    repo.addMember(ORG_A, MANAGER_2, "manager");
    repo.addMember(ORG_A, ATHLETE_1, "athlete");
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
      repo.assignTemplateToGroup(GROUP_1, t1.id);

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
      expect(notifiedPayloads).toHaveLength(1);
      const payload = notifiedPayloads[0];
      expect(payload).toEqual({
        orgId: ORG_A,
        templateId: created.id,
        action: "created",
        actorId: MANAGER_1,
        recipientIds: [MANAGER_2],
      });
      // Verify payload contains NO health data or feedback
      expect(payload).not.toHaveProperty("rpe");
      expect(payload).not.toHaveProperty("feedback");
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

      expect(notifiedPayloads).toHaveLength(1);
      expect(notifiedPayloads[0]).toEqual({
        orgId: ORG_A,
        templateId: template.id,
        action: "updated",
        actorId: MANAGER_1,
        recipientIds: [MANAGER_2],
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

      expect(notifiedPayloads).toHaveLength(1);
      expect(notifiedPayloads[0]).toEqual({
        orgId: ORG_A,
        templateId: template.id,
        action: "deleted",
        actorId: MANAGER_1,
        recipientIds: [MANAGER_2],
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
});
