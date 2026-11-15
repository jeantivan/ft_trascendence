import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryTrainingRepository } from "../../support/in-memory-training-repository";

describe("InMemoryTrainingRepository", () => {
  let repo: InMemoryTrainingRepository;
  const ORG_A = "org-1111-1111-1111-111111111111";
  const ORG_B = "org-2222-2222-2222-222222222222";
  const MANAGER_1 = "usr-mgr1-1111-1111-111111111111";
  const MANAGER_2 = "usr-mgr2-2222-2222-222222222222";
  const ATHLETE_1 = "usr-ath1-3333-3333-333333333333";
  const GROUP_1 = "grp-1111-1111-1111-111111111111";

  beforeEach(() => {
    repo = new InMemoryTrainingRepository();
    repo.addMember(ORG_A, MANAGER_1, "manager");
    repo.addMember(ORG_A, MANAGER_2, "manager");
    repo.addMember(ORG_A, ATHLETE_1, "athlete");
    repo.addAthleteToGroup(ATHLETE_1, GROUP_1);
  });

  it("finds role and other manager IDs", async () => {
    expect(await repo.findRole(ORG_A, MANAGER_1)).toBe("manager");
    expect(await repo.findRole(ORG_A, ATHLETE_1)).toBe("athlete");
    expect(await repo.findRole(ORG_B, MANAGER_1)).toBeNull();

    const otherManagers = await repo.findOtherManagerIds(ORG_A, MANAGER_1);
    expect(otherManagers).toEqual([MANAGER_2]);
  });

  it("creates template with reindexed session positions", async () => {
    const template = await repo.create({
      orgId: ORG_A,
      name: "10K Base",
      createdBy: MANAGER_1,
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
    const t1 = await repo.create({
      orgId: ORG_A,
      name: "Marathon Prep",
      createdBy: MANAGER_1,
      sessions: [{ sessionType: "tirada_larga", dayOffset: 6, targetDistanceM: 20000 }],
    });
    const t2 = await repo.create({
      orgId: ORG_A,
      name: "5K Speed",
      createdBy: MANAGER_2,
      sessions: [{ sessionType: "fartlek", dayOffset: 1, targetDurationS: 2400 }],
    });

    // Manager sees all templates in the organization
    const managerList = await repo.listForManager(ORG_A);
    expect(managerList.map((t) => t.id)).toEqual(expect.arrayContaining([t1.id, t2.id]));

    // Athlete has no templates assigned yet -> empty
    expect(await repo.listForAthlete(ORG_A, ATHLETE_1)).toHaveLength(0);

    // Assign t1 to Athlete's group
    repo.assignTemplateToGroup(GROUP_1, t1.id);

    const athleteList = await repo.listForAthlete(ORG_A, ATHLETE_1);
    expect(athleteList).toHaveLength(1);
    expect(athleteList[0].id).toBe(t1.id);
  });

  it("updates template name and sessions reindexing position", async () => {
    const template = await repo.create({
      orgId: ORG_A,
      name: "Initial Name",
      createdBy: MANAGER_1,
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });

    const updated = await repo.update(template.id, {
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

  it("deletes template and preserves copied sessions with sourceTemplateId: null", async () => {
    const template = await repo.create({
      orgId: ORG_A,
      name: "To Delete",
      createdBy: MANAGER_1,
      sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
    });

    repo.assignTemplateToGroup(GROUP_1, template.id);
    expect(repo.copiedSessions[0].sourceTemplateId).toBe(template.id);

    await repo.delete(template.id);

    expect(await repo.findById(template.id)).toBeNull();
    expect(repo.copiedSessions[0].sourceTemplateId).toBeNull();
  });
});
