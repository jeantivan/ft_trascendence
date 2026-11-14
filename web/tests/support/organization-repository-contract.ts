import { describe, expect, it } from "vitest";
import {
  AlreadyManagerError,
  LastManagerError,
  NotManagerError,
  OrganizationNameTakenError,
  OrganizationNotFoundError,
  type OrganizationRepository,
  UserNotFoundError,
} from "@/lib/org/organization-repository";

// A valid id that no club and no user has
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

export interface NewClub {
  name: string;
  description: string | null;
  timezone: string;
  // How many members the club starts with
  members: number;
}

// What each implementation gives the contract: the repository, and a way to put
// a club in it (a real database needs users for the members, memory does not)
export interface OrganizationFixture {
  repo: OrganizationRepository;
  createClub(club: NewClub): Promise<string>;
  // Users that exist, to be the Admin or a Manager of a club
  createUsers(count: number): Promise<string[]>;
  // Makes an existing user an athlete member of an existing club
  addAthlete(orgId: string, userId: string): Promise<void>;
}

let clubCount = 0;

// A club with a name no other has (the name is unique), so tests do not clash
function newClub(overrides: Partial<NewClub> = {}): NewClub {
  return {
    name: `Club de prueba ${clubCount++}`,
    description: "Salimos los martes",
    timezone: "Europe/Madrid",
    members: 3,
    ...overrides,
  };
}

// Rules every OrganizationRepository must follow. The database may already have
// other clubs, so each test looks up its own club by id.
export function runOrganizationRepositoryContract(
  name: string,
  createFixture: () => OrganizationFixture,
) {
  describe(`OrganizationRepository contract: ${name}`, () => {
    it("listCatalog returns the club's name, description and member count", async () => {
      const { repo, createClub } = createFixture();
      const data = newClub();
      const id = await createClub(data);

      const catalog = await repo.listCatalog();

      expect(catalog.find((club) => club.id === id)).toEqual({
        id,
        name: data.name,
        description: data.description,
        memberCount: 3,
      });
    });

    it("listCatalog counts only each club's own members", async () => {
      const { repo, createClub } = createFixture();
      const empty = await createClub(newClub({ members: 0 }));
      const full = await createClub(newClub({ members: 5 }));

      const catalog = await repo.listCatalog();

      expect(catalog.find((club) => club.id === empty)?.memberCount).toBe(0);
      expect(catalog.find((club) => club.id === full)?.memberCount).toBe(5);
    });

    it("listCatalog exposes neither the time zone nor any internal data", async () => {
      const { repo, createClub } = createFixture();
      const data = newClub();
      const id = await createClub(data);

      const club = (await repo.listCatalog()).find((c) => c.id === id);

      expect(Object.keys(club ?? {}).sort()).toEqual(["description", "id", "memberCount", "name"]);
    });

    it("findById returns the club's record with its time zone", async () => {
      const { repo, createClub } = createFixture();
      const data = newClub();
      const id = await createClub(data);

      await expect(repo.findById(id)).resolves.toEqual({
        id,
        name: data.name,
        description: data.description,
        timezone: data.timezone,
      });
    });

    it("findById returns null if the club does not exist", async () => {
      const { repo } = createFixture();

      await expect(repo.findById(UNKNOWN_ID)).resolves.toBeNull();
    });

    it("update changes description and time zone, keeps the name and returns the new record", async () => {
      const { repo, createClub } = createFixture();
      const data = newClub();
      const id = await createClub(data);

      const updated = await repo.update(id, { description: null, timezone: "Europe/London" });

      expect(updated).toEqual({
        id,
        name: data.name,
        description: null,
        timezone: "Europe/London",
      });
      await expect(repo.findById(id)).resolves.toEqual(updated);
    });

    it("update returns null if the club does not exist", async () => {
      const { repo } = createFixture();

      await expect(
        repo.update(UNKNOWN_ID, { description: null, timezone: "Europe/London" }),
      ).resolves.toBeNull();
    });

    it("createWithManagers creates the club and returns its record", async () => {
      const { repo, createUsers } = createFixture();
      const data = newClub();
      const [adminId, managerId] = await createUsers(2);

      const created = await repo.createWithManagers(adminId, {
        name: data.name,
        description: data.description,
        timezone: data.timezone,
        managerIds: [managerId],
      });

      expect(created).toEqual({
        id: expect.any(String),
        name: data.name,
        description: data.description,
        timezone: data.timezone,
      });
      await expect(repo.findById(created.id)).resolves.toEqual(created);
    });

    it("createWithManagers makes every initial Manager a member", async () => {
      const { repo, createUsers } = createFixture();
      const data = newClub();
      const [adminId, managerA, managerB] = await createUsers(3);

      const created = await repo.createWithManagers(adminId, {
        name: data.name,
        description: data.description,
        timezone: data.timezone,
        managerIds: [managerA, managerB],
      });

      const catalog = await repo.listCatalog();
      expect(catalog.find((club) => club.id === created.id)?.memberCount).toBe(2);
    });

    it("createWithManagers throws OrganizationNameTakenError if the name already exists", async () => {
      const { repo, createClub, createUsers } = createFixture();
      const data = newClub();
      await createClub(data);
      const [adminId, managerId] = await createUsers(2);

      await expect(
        repo.createWithManagers(adminId, {
          name: data.name,
          description: null,
          timezone: data.timezone,
          managerIds: [managerId],
        }),
      ).rejects.toBeInstanceOf(OrganizationNameTakenError);
    });

    it("createWithManagers throws UserNotFoundError if a Manager does not exist and creates no club", async () => {
      const { repo, createUsers } = createFixture();
      const data = newClub();
      const [adminId, managerId] = await createUsers(2);

      await expect(
        repo.createWithManagers(adminId, { ...data, managerIds: [managerId, UNKNOWN_ID] }),
      ).rejects.toBeInstanceOf(UserNotFoundError);

      const catalog = await repo.listCatalog();
      expect(catalog.some((club) => club.name === data.name)).toBe(false);
    });

    it("createWithManagers treats the same Manager in different capitalization as one", async () => {
      const { repo, createUsers } = createFixture();
      const data = newClub();
      const [adminId, managerId] = await createUsers(2);

      const created = await repo.createWithManagers(adminId, {
        ...data,
        managerIds: [managerId, managerId.toUpperCase()],
      });

      expect(await repo.listManagerIds(created.id)).toEqual([managerId]);
    });

    // A club with one Manager, plus an admin and an athlete member to work with
    async function clubWithAthlete() {
      const { repo, createUsers, addAthlete } = createFixture();
      const [adminId, managerId, athleteId, strangerId] = await createUsers(4);
      const data = newClub();
      const club = await repo.createWithManagers(adminId, { ...data, managerIds: [managerId] });
      await addAthlete(club.id, athleteId);
      return { repo, adminId, managerId, athleteId, strangerId, orgId: club.id };
    }

    it("assignManager promotes a member to Manager and keeps the previous Manager", async () => {
      const { repo, adminId, managerId, athleteId, orgId } = await clubWithAthlete();

      await repo.assignManager(adminId, orgId, athleteId);

      expect((await repo.listManagerIds(orgId)).sort()).toEqual([managerId, athleteId].sort());
    });

    it("assignManager makes a non-member a member and Manager", async () => {
      const { repo, adminId, strangerId, orgId } = await clubWithAthlete();

      await repo.assignManager(adminId, orgId, strangerId);

      expect(await repo.listManagerIds(orgId)).toContain(strangerId);
      const catalog = await repo.listCatalog();
      expect(catalog.find((club) => club.id === orgId)?.memberCount).toBe(3);
    });

    it("assignManager throws AlreadyManagerError if already a Manager", async () => {
      const { repo, adminId, managerId, orgId } = await clubWithAthlete();

      await expect(repo.assignManager(adminId, orgId, managerId)).rejects.toBeInstanceOf(
        AlreadyManagerError,
      );
    });

    it("removeManager leaves the Manager as an athlete member of the club", async () => {
      const { repo, adminId, managerId, athleteId, orgId } = await clubWithAthlete();
      await repo.assignManager(adminId, orgId, athleteId);

      await repo.removeManager(adminId, orgId, managerId);

      expect(await repo.listManagerIds(orgId)).toEqual([athleteId]);
      const catalog = await repo.listCatalog();
      expect(catalog.find((club) => club.id === orgId)?.memberCount).toBe(2);
    });

    it("removeManager throws LastManagerError if no Manager would remain", async () => {
      const { repo, adminId, managerId, orgId } = await clubWithAthlete();

      await expect(repo.removeManager(adminId, orgId, managerId)).rejects.toBeInstanceOf(
        LastManagerError,
      );
      expect(await repo.listManagerIds(orgId)).toEqual([managerId]);
    });

    it("removeManager throws NotManagerError if the user is an athlete", async () => {
      const { repo, adminId, athleteId, orgId } = await clubWithAthlete();

      await expect(repo.removeManager(adminId, orgId, athleteId)).rejects.toBeInstanceOf(
        NotManagerError,
      );
    });

    it("removeManager throws NotManagerError if the user is not a member", async () => {
      const { repo, adminId, strangerId, orgId } = await clubWithAthlete();

      await expect(repo.removeManager(adminId, orgId, strangerId)).rejects.toBeInstanceOf(
        NotManagerError,
      );
    });

    it("assignManager and removeManager accept upper-case ids for the same user and club", async () => {
      const { repo, adminId, managerId, athleteId, orgId } = await clubWithAthlete();

      await repo.assignManager(adminId, orgId.toUpperCase(), athleteId.toUpperCase());
      expect((await repo.listManagerIds(orgId)).sort()).toEqual([managerId, athleteId].sort());
      await expect(
        repo.assignManager(adminId, orgId, athleteId.toUpperCase()),
      ).rejects.toBeInstanceOf(AlreadyManagerError);

      await repo.removeManager(adminId, orgId.toUpperCase(), athleteId.toUpperCase());
      expect(await repo.listManagerIds(orgId)).toEqual([managerId]);
    });

    // strangerId exists but has no membership; UNKNOWN_ID does not exist at all
    for (const operation of ["assignManager", "removeManager"] as const) {
      it(`${operation} throws UserNotFoundError if the user does not exist and changes nothing`, async () => {
        const { repo, adminId, managerId, orgId } = await clubWithAthlete();

        await expect(repo[operation](adminId, orgId, UNKNOWN_ID)).rejects.toBeInstanceOf(
          UserNotFoundError,
        );
        expect(await repo.listManagerIds(orgId)).toEqual([managerId]);
        const catalog = await repo.listCatalog();
        expect(catalog.find((club) => club.id === orgId)?.memberCount).toBe(2);
      });

      it(`${operation} throws UserNotFoundError if neither the user nor the club exists`, async () => {
        const { repo, adminId, managerId, orgId } = await clubWithAthlete();

        await expect(repo[operation](adminId, UNKNOWN_ID, UNKNOWN_ID)).rejects.toBeInstanceOf(
          UserNotFoundError,
        );
        expect(await repo.listManagerIds(UNKNOWN_ID)).toEqual([]);
        expect(await repo.listManagerIds(orgId)).toEqual([managerId]);
      });

      it(`${operation} throws OrganizationNotFoundError if the club does not exist and creates no membership`, async () => {
        const { repo, adminId, strangerId } = await clubWithAthlete();

        await expect(repo[operation](adminId, UNKNOWN_ID, strangerId)).rejects.toBeInstanceOf(
          OrganizationNotFoundError,
        );
        expect(await repo.listManagerIds(UNKNOWN_ID)).toEqual([]);
      });
    }
  });
}
