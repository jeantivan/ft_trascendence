import { describe, expect, it } from "vitest";
import { TrainingNotFoundError } from "@/lib/training/errors";
import type { TrainingRepository } from "@/lib/training/types";

const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

export interface TrainingRepositoryFixture {
  repo: TrainingRepository;
  orgId: string;
  otherOrgId: string;
  manager1Id: string;
  manager2Id: string;
  athleteId: string;
  groupId: string;
  assignTemplateToGroup(groupId: string, templateId: string): Promise<void>;
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
        assignTemplateToGroup,
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

      await assignTemplateToGroup(groupId, t1.id);

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
  });
}
