import { beforeEach, describe, expect, it, vi } from "vitest";
import { notFound, forbidden } from "next/navigation";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import {
  listTrainingTemplatesAction,
  getTrainingTemplateAction,
  createTrainingTemplateAction,
  updateTrainingTemplateAction,
  deleteTrainingTemplateAction,
  assignTrainingTemplateAction,
  getAthleteScheduleAction,
  listClubSessionsAction,
} from "@/lib/training/actions";
import { TRAINING_TEMPLATE_ASSIGNED } from "@/lib/training/types";
import { notify } from "@/lib/notifications/notify";
import { InMemoryTrainingRepository } from "../../support/in-memory-training-repository";

const repoHolder = vi.hoisted(() => ({
  current: null as InMemoryTrainingRepository | null,
}));

vi.mock("@/lib/training/prisma-training-repository", () => ({
  trainingRepository: new Proxy({} as InMemoryTrainingRepository, {
    get(_target, prop) {
      const instance = repoHolder.current!;
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }),
}));

vi.mock("@/lib/permissions/require-org-role", () => ({
  requireOrgRole: vi.fn(),
}));

vi.mock("@/lib/notifications/notify", () => ({
  notify: vi.fn(),
}));

class NextNavigationSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextNavigationSignal";
  }
}

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new NextNavigationSignal("NEXT_NOT_FOUND");
  }),
  forbidden: vi.fn(() => {
    throw new NextNavigationSignal("NEXT_FORBIDDEN");
  }),
}));

describe("Training Server Actions", () => {
  let repo: InMemoryTrainingRepository;

  const ORG_A = "org-1111-1111-1111-111111111111";
  const MANAGER_USER = {
    id: "usr-mgr1-1111-1111-111111111111",
    email: "manager@club.com",
    nick: "Coach",
    roleGlobal: "user" as const,
  };
  const ATHLETE_USER = {
    id: "usr-ath1-3333-3333-333333333333",
    email: "athlete@club.com",
    nick: "Runner",
    roleGlobal: "user" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new InMemoryTrainingRepository();
    repoHolder.current = repo;

    repo.addMember(ORG_A, MANAGER_USER.id, "manager");
    repo.addMember(ORG_A, ATHLETE_USER.id, "athlete");
  });

  describe("listTrainingTemplatesAction", () => {
    it("calls requireOrgRole with trainingTemplate.read roles and returns templates", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      await repo.create({
        orgId: ORG_A,
        name: "Base Plan",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const result = await listTrainingTemplatesAction(ORG_A);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.read"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("Base Plan");
      }
    });

    it("propagates Next.js exception when requireOrgRole throws", async () => {
      vi.mocked(requireOrgRole).mockRejectedValueOnce(
        new NextNavigationSignal("NEXT_REDIRECT")
      );

      await expect(listTrainingTemplatesAction(ORG_A)).rejects.toThrow(
        NextNavigationSignal
      );
    });
  });

  describe("getTrainingTemplateAction", () => {
    it("returns template for manager", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const created = await repo.create({
        orgId: ORG_A,
        name: "Speed Work",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "intervalos", dayOffset: 1 }],
      });

      const result = await getTrainingTemplateAction(ORG_A, created.id);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.read"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Speed Work");
      }
    });

    it("triggers notFound() (404) when template is not found or belongs to another club", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      await expect(
        getTrainingTemplateAction(ORG_A, "non-existent-id")
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledOnce();
    });
  });

  describe("createTrainingTemplateAction", () => {
    it("calls requireOrgRole with trainingTemplate.write and creates template", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const input = {
        name: "Marathon Sub 3h",
        sessions: [
          { sessionType: "tirada_larga", dayOffset: 6, targetDistanceM: 30000 },
        ],
      };

      const result = await createTrainingTemplateAction(ORG_A, input);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.write"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Marathon Sub 3h");
        expect(result.data.sessions[0].position).toBe(0);
      }
    });

    it("returns { success: false, error } on validation error", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const invalidInput = { name: "", sessions: [] };

      const result = await createTrainingTemplateAction(ORG_A, invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it("triggers forbidden() (403) if role is downgraded between requireOrgRole and TrainingService", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: ATHLETE_USER,
        role: "manager",
      });

      await expect(
        createTrainingTemplateAction(ORG_A, {
          name: "Downgraded Role",
          sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
        })
      ).rejects.toThrow("NEXT_FORBIDDEN");
      expect(forbidden).toHaveBeenCalledOnce();
    });
  });

  describe("updateTrainingTemplateAction", () => {
    it("calls requireOrgRole with trainingTemplate.write and updates template", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const created = await repo.create({
        orgId: ORG_A,
        name: "Old Title",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const result = await updateTrainingTemplateAction(
        ORG_A,
        created.id,
        { name: "New Title" }
      );

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.write"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("New Title");
      }
    });

    it("triggers notFound() (404) when updating template from another club", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const otherClubTemplate = await repo.create({
        orgId: "org-9999-9999-9999-999999999999",
        name: "Other Club Plan",
        createdBy: "other-manager",
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      await expect(
        updateTrainingTemplateAction(ORG_A, otherClubTemplate.id, {
          name: "Hijack",
        })
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledOnce();
    });
  });

  describe("deleteTrainingTemplateAction", () => {
    it("calls requireOrgRole with trainingTemplate.write and deletes template", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const created = await repo.create({
        orgId: ORG_A,
        name: "To Remove",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      const result = await deleteTrainingTemplateAction(ORG_A, created.id);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.write"]
      );
      expect(result.success).toBe(true);
      expect(await repo.findById(created.id)).toBeNull();
    });

    it("triggers notFound() (404) when deleting template from another club", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      await expect(
        deleteTrainingTemplateAction(ORG_A, "missing-template-id")
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledOnce();
    });
  });

  describe("assignTrainingTemplateAction", () => {
    const GROUP_1 = "13500000-0000-4000-8000-000000000041";

    it("calls requireOrgRole with trainingTemplate.write, creates sessions, and notifies group athletes", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      repo.addGroup(ORG_A, GROUP_1);
      repo.addAthleteToGroup(ATHLETE_USER.id, GROUP_1);

      const created = await repo.create({
        orgId: ORG_A,
        name: "10K Group Block",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "rodaje", dayOffset: 1, targetDistanceM: 6000 }],
      });

      const result = await assignTrainingTemplateAction(ORG_A, {
        templateId: created.id,
        groupId: GROUP_1,
        startDate: "2026-07-01",
      });

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.write"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].sourceTemplateId).toBe(created.id);
        expect(result.data[0].groupId).toBe(GROUP_1);
      }
      expect(notify).toHaveBeenCalledWith(expect.anything(), {
        userId: ATHLETE_USER.id,
        type: TRAINING_TEMPLATE_ASSIGNED,
        payload: {
          orgId: ORG_A,
          templateId: created.id,
          groupId: GROUP_1,
        },
      });
    });

    it("propagates 403 when requireOrgRole rejects an athlete", async () => {
      vi.mocked(requireOrgRole).mockImplementationOnce(() => {
        forbidden();
      });

      await expect(
        assignTrainingTemplateAction(ORG_A, {
          templateId: "13500000-0000-4000-8000-000000000010",
          groupId: GROUP_1,
          startDate: "2026-07-01",
        })
      ).rejects.toThrow("NEXT_FORBIDDEN");
      expect(forbidden).toHaveBeenCalledOnce();
    });

    it("triggers notFound() (404) when group or template belongs to another club", async () => {
      const ORG_OTHER = "org-9999-9999-9999-999999999999";
      const OTHER_GROUP = "13500000-0000-4000-8000-000000000049";
      repo.addGroup(ORG_A, GROUP_1);
      repo.addGroup(ORG_OTHER, OTHER_GROUP);

      const created = await repo.create({
        orgId: ORG_A,
        name: "Club A Template",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });
      const otherClubTemplate = await repo.create({
        orgId: ORG_OTHER,
        name: "Other Club Template",
        createdBy: "other-manager",
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      });

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });
      await expect(
        assignTrainingTemplateAction(ORG_A, {
          templateId: created.id,
          groupId: OTHER_GROUP,
          startDate: "2026-07-01",
        })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });
      await expect(
        assignTrainingTemplateAction(ORG_A, {
          templateId: otherClubTemplate.id,
          groupId: GROUP_1,
          startDate: "2026-07-01",
        })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(notFound).toHaveBeenCalledTimes(2);
    });

    it("returns { success: false, error } on invalid startDate", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const result = await assignTrainingTemplateAction(ORG_A, {
        templateId: "13500000-0000-4000-8000-000000000010",
        groupId: GROUP_1,
        startDate: "2026-02-30",
      });

      expect(result.success).toBe(false);
    });

    it("returns { success: false, error } on duplicate assignment for same startDate without notifying twice", async () => {
      repo.addGroup(ORG_A, GROUP_1);
      repo.addAthleteToGroup(ATHLETE_USER.id, GROUP_1);

      const created = await repo.create({
        orgId: ORG_A,
        name: "No Double Click Plan",
        createdBy: MANAGER_USER.id,
        sessions: [{ sessionType: "rodaje", dayOffset: 0, targetDistanceM: 5000 }],
      });

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });
      const first = await assignTrainingTemplateAction(ORG_A, {
        templateId: created.id,
        groupId: GROUP_1,
        startDate: "2026-07-01",
      });
      expect(first.success).toBe(true);

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });
      const duplicate = await assignTrainingTemplateAction(ORG_A, {
        templateId: created.id,
        groupId: GROUP_1,
        startDate: "2026-07-01",
      });
      expect(duplicate.success).toBe(false);
      if (!duplicate.success) {
        expect(duplicate.error).toContain("ya está asignada");
      }
      expect(notify).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAthleteScheduleAction", () => {
    const GROUP_1 = "13700000-0000-4000-8000-000000000041";

    it("calls requireOrgRole with session.read and returns the athlete's substituted schedule", async () => {
      repo.addGroup(ORG_A, GROUP_1);
      repo.addAthleteToGroup(ATHLETE_USER.id, GROUP_1);

      const groupSession = repo.seedSession({
        orgId: ORG_A,
        origin: "template",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-10-01T08:00:00.000Z"),
        groupId: GROUP_1,
      });
      const customized = repo.seedSession({
        orgId: ORG_A,
        origin: "customized",
        sessionType: "rodaje",
        scheduledAt: new Date("2026-10-01T09:00:00.000Z"),
        athleteId: ATHLETE_USER.id,
        customizesSessionId: groupSession.id,
      });
      const freeSession = repo.seedSession({
        orgId: ORG_A,
        origin: "free",
        sessionType: "fartlek",
        scheduledAt: new Date("2026-10-02T08:00:00.000Z"),
        athleteId: ATHLETE_USER.id,
      });

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: ATHLETE_USER,
        role: "athlete",
      });

      const result = await getAthleteScheduleAction(ORG_A);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["session.read"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.map((s) => s.id)).toEqual([
          customized.id,
          freeSession.id,
        ]);
      }
    });

    it("triggers notFound() (404) when an athlete requests another athlete's schedule", async () => {
      const OTHER_ATHLETE = "usr-ath2-4444-4444-4444-444444444444";
      repo.addMember(ORG_A, OTHER_ATHLETE, "athlete");

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: ATHLETE_USER,
        role: "athlete",
      });

      await expect(
        getAthleteScheduleAction(ORG_A, OTHER_ATHLETE)
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound).toHaveBeenCalledOnce();
    });
  });

  describe("listClubSessionsAction", () => {
    it("calls requireOrgRole with freeSession.read and returns all club sessions for a manager", async () => {
      const freeSession = repo.seedSession({
        orgId: ORG_A,
        origin: "free",
        sessionType: "cuestas",
        scheduledAt: new Date("2026-10-05T08:00:00.000Z"),
        athleteId: ATHLETE_USER.id,
      });

      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const result = await listClubSessionsAction(ORG_A);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["freeSession.read"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.map((s) => s.id)).toEqual([freeSession.id]);
      }
    });

    it("triggers forbidden() (403) when an athlete calls listClubSessionsAction", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: ATHLETE_USER,
        role: "athlete",
      });

      await expect(listClubSessionsAction(ORG_A)).rejects.toThrow(
        "NEXT_FORBIDDEN"
      );
      expect(forbidden).toHaveBeenCalledOnce();
    });
  });
});
