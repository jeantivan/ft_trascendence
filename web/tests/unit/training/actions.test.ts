import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import {
  listTrainingTemplatesAction,
  getTrainingTemplateAction,
  createTrainingTemplateAction,
  updateTrainingTemplateAction,
  deleteTrainingTemplateAction,
} from "@/lib/training/actions";
import { InMemoryTrainingRepository } from "../../support/in-memory-training-repository";
import { TrainingService } from "@/lib/training/training-service";

vi.mock("@/lib/permissions/require-org-role", () => ({
  requireOrgRole: vi.fn(),
}));

class NextNavigationSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextNavigationSignal";
  }
}

describe("Training Server Actions", () => {
  let repo: InMemoryTrainingRepository;
  let service: TrainingService;

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
    vi.resetAllMocks();
    repo = new InMemoryTrainingRepository();
    service = new TrainingService(repo);

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

      const result = await listTrainingTemplatesAction(ORG_A, service);

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

      await expect(listTrainingTemplatesAction(ORG_A, service)).rejects.toThrow(
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

      const result = await getTrainingTemplateAction(ORG_A, created.id, service);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.read"]
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Speed Work");
      }
    });

    it("returns { success: false, error } when template is not found", async () => {
      vi.mocked(requireOrgRole).mockResolvedValueOnce({
        user: MANAGER_USER,
        role: "manager",
      });

      const result = await getTrainingTemplateAction(ORG_A, "non-existent-id", service);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("no encontrado");
      }
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

      const result = await createTrainingTemplateAction(ORG_A, input, service);

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

      const result = await createTrainingTemplateAction(ORG_A, invalidInput, service);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
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
        { name: "New Title" },
        service
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

      const result = await deleteTrainingTemplateAction(ORG_A, created.id, service);

      expect(requireOrgRole).toHaveBeenCalledWith(
        ORG_A,
        ORG_ROLES["trainingTemplate.write"]
      );
      expect(result.success).toBe(true);
      expect(await repo.findById(created.id)).toBeNull();
    });
  });
});
