import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryTrainingRepository } from "../../support/in-memory-training-repository";
import { runTrainingRepositoryContract } from "../../support/training-repository-contract";

describe("InMemoryTrainingRepository", () => {
  let repo: InMemoryTrainingRepository;
  const ORG_A = "13400000-0000-4000-8000-000000000001";
  const ORG_B = "13400000-0000-4000-8000-000000000002";
  const MANAGER_1 = "13400000-0000-4000-8000-000000000011";
  const MANAGER_2 = "13400000-0000-4000-8000-000000000012";
  const ATHLETE_1 = "13400000-0000-4000-8000-000000000021";
  const ATHLETE_2 = "13400000-0000-4000-8000-000000000022";
  const GROUP_1 = "13400000-0000-4000-8000-000000000041";
  const GROUP_2 = "13400000-0000-4000-8000-000000000044";
  const EMPTY_GROUP = "13400000-0000-4000-8000-000000000042";
  const OTHER_GROUP = "13400000-0000-4000-8000-000000000043";

  beforeEach(() => {
    repo = new InMemoryTrainingRepository();
    repo.addMember(ORG_A, MANAGER_1, "manager");
    repo.addMember(ORG_A, MANAGER_2, "manager");
    repo.addMember(ORG_A, ATHLETE_1, "athlete");
    repo.addMember(ORG_A, ATHLETE_2, "athlete");
    repo.addGroup(ORG_A, GROUP_1);
    repo.addGroup(ORG_A, GROUP_2);
    repo.addGroup(ORG_A, EMPTY_GROUP);
    repo.addGroup(ORG_B, OTHER_GROUP);
    repo.addAthleteToGroup(ATHLETE_1, GROUP_1);
    repo.addAthleteToGroup(ATHLETE_1, GROUP_2);
    repo.addAthleteToGroup(ATHLETE_2, GROUP_2);
  });

  runTrainingRepositoryContract("in memory", () => ({
    repo,
    orgId: ORG_A,
    otherOrgId: ORG_B,
    manager1Id: MANAGER_1,
    manager2Id: MANAGER_2,
    athleteId: ATHLETE_1,
    secondAthleteId: ATHLETE_2,
    groupId: GROUP_1,
    secondGroupId: GROUP_2,
    emptyGroupId: EMPTY_GROUP,
    otherOrgGroupId: OTHER_GROUP,
    seedTemplateAssignment: async (groupId, templateId) => {
      repo.seedTemplateAssignment(groupId, templateId);
    },
    seedSession: async (input) => repo.seedSession(input),
    seedSessionLog: async (sessionId, athleteId) => {
      repo.seedSessionLog(sessionId, athleteId);
    },
  }));

  it("updates template without altering previously copied sessions", async () => {
    const template = await repo.create({
      orgId: ORG_A,
      name: "Initial Name",
      createdBy: MANAGER_1,
      sessions: [{ sessionType: "rodaje", dayOffset: 0, targetDistanceM: 5000 }],
    });

    repo.seedTemplateAssignment(GROUP_1, template.id);
    expect(repo.copiedSessions).toHaveLength(1);
    const copiedBefore = { ...repo.copiedSessions[0] };

    await repo.update(ORG_A, template.id, {
      name: "Updated Name",
      sessions: [{ sessionType: "intervalos", dayOffset: 3, targetDistanceM: 12000 }],
    });

    expect(repo.copiedSessions).toHaveLength(1);
    expect(repo.copiedSessions[0]).toEqual(copiedBefore);
    expect(repo.copiedSessions[0].sessionType).toBe("rodaje");
    expect(repo.copiedSessions[0].targetDistanceM).toBe(5000);
    expect(repo.copiedSessions[0].sourceTemplateId).toBe(template.id);
  });

  it("deletes template and preserves copied sessions with sourceTemplateId: null", async () => {
    const template = await repo.create({
      orgId: ORG_A,
      name: "To Delete",
      createdBy: MANAGER_1,
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });

    repo.seedTemplateAssignment(GROUP_1, template.id);
    expect(repo.copiedSessions[0].sourceTemplateId).toBe(template.id);

    await repo.delete(ORG_A, template.id);

    expect(await repo.findById(template.id)).toBeNull();
    expect(repo.copiedSessions[0].sourceTemplateId).toBeNull();
  });
});
