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
} from "@/lib/training/actions";
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
});
