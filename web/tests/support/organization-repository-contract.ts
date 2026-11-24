import { describe, expect, it } from "vitest";
import {
  AdminCannotBeManagerError,
  AlreadyManagerError,
  AlreadyMemberError,
  BlockedAccountError,
  LastManagerError,
  MembershipRequestNotFoundError,
  MembershipRequestNotPendingError,
  RequestAlreadyPendingError,
  NotManagerError,
  OrganizationDeletionAlreadyScheduledError,
  OrganizationDeletionNotScheduledError,
  OrganizationNameTakenError,
  OrganizationNotFoundError,
  type OrganizationRepository,
  UserNotFoundError,
} from "@/lib/org/organization-repository";
import {
  MEMBERSHIP_ACCEPTED,
  MEMBERSHIP_INVITATION_CREATED,
  MEMBERSHIP_REQUEST_CREATED,
} from "@/lib/org/membership-notifier";
import type { NotifyInput } from "@/lib/notifications/notify";

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
  // Users that exist and are Admin accounts
  createAdmins(count: number): Promise<string[]>;
  // Makes an existing user an athlete member of an existing club
  addAthlete(orgId: string, userId: string): Promise<void>;
  // Blocks an existing user
  blockUser(userId: string): Promise<void>;
  // The notifications the repository has sent so far (read from a fake notify())
  sent(): NotifyInput[];
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
        deleteAt: null,
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

      expect(Object.keys(club ?? {}).sort()).toEqual(["deleteAt", "description", "id", "memberCount", "name"]);
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
        deleteAt: null,
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
        deleteAt: null,
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
        deleteAt: null,
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

    it("createWithManagers throws AdminCannotBeManagerError if a Manager is another Admin account and creates no club", async () => {
      const { repo, createUsers, createAdmins } = createFixture();
      const data = newClub();
      const [adminId, managerId] = await createUsers(2);
      const [otherAdminId] = await createAdmins(1);

      await expect(
        repo.createWithManagers(adminId, { ...data, managerIds: [managerId, otherAdminId.toUpperCase()] }),
      ).rejects.toBeInstanceOf(AdminCannotBeManagerError);

      const catalog = await repo.listCatalog();
      expect(catalog.some((club) => club.name === data.name)).toBe(false);
    });

    it("createWithManagers throws BlockedAccountError if a Manager is blocked and creates no club", async () => {
      const { repo, createUsers, blockUser } = createFixture();
      const data = newClub();
      const [adminId, managerId, blockedId] = await createUsers(3);
      await blockUser(blockedId);

      await expect(
        repo.createWithManagers(adminId, { ...data, managerIds: [managerId, blockedId] }),
      ).rejects.toBeInstanceOf(BlockedAccountError);

      const catalog = await repo.listCatalog();
      expect(catalog.some((club) => club.name === data.name)).toBe(false);
    });

    it("createWithManagers reports a missing user, then an Admin account, before a blocked one", async () => {
      const { repo, createUsers, createAdmins, blockUser } = createFixture();
      const [adminId, blockedId] = await createUsers(2);
      const [otherAdminId] = await createAdmins(1);
      await blockUser(blockedId);

      await expect(
        repo.createWithManagers(adminId, { ...newClub(), managerIds: [blockedId, UNKNOWN_ID] }),
      ).rejects.toBeInstanceOf(UserNotFoundError);
      await expect(
        repo.createWithManagers(adminId, { ...newClub(), managerIds: [blockedId, otherAdminId] }),
      ).rejects.toBeInstanceOf(AdminCannotBeManagerError);
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

    it("assignManager throws AdminCannotBeManagerError for another Admin account and changes nothing", async () => {
      const { repo, createUsers, createAdmins, createClub } = createFixture();
      const [adminId] = await createUsers(1);
      const [otherAdminId] = await createAdmins(1);
      const orgId = await createClub(newClub());

      await expect(repo.assignManager(adminId, orgId, otherAdminId)).rejects.toBeInstanceOf(
        AdminCannotBeManagerError,
      );
      await expect(repo.listManagerIds(orgId)).resolves.toEqual([]);
    });

    // A club with one Manager, plus an admin and an athlete member to work with
    async function clubWithAthlete() {
      const { repo, createUsers, addAthlete, blockUser } = createFixture();
      const [adminId, managerId, athleteId, strangerId] = await createUsers(4);
      const data = newClub();
      const club = await repo.createWithManagers(adminId, { ...data, managerIds: [managerId] });
      await addAthlete(club.id, athleteId);
      return { repo, adminId, managerId, athleteId, strangerId, orgId: club.id, blockUser };
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

    it("assignManager throws BlockedAccountError for a blocked non-member and changes nothing", async () => {
      const { repo, adminId, strangerId, orgId, blockUser } = await clubWithAthlete();
      await blockUser(strangerId);

      await expect(repo.assignManager(adminId, orgId, strangerId)).rejects.toBeInstanceOf(
        BlockedAccountError,
      );
      expect(await repo.listManagerIds(orgId)).not.toContain(strangerId);
      const catalog = await repo.listCatalog();
      expect(catalog.find((club) => club.id === orgId)?.memberCount).toBe(2);
    });

    it("assignManager throws BlockedAccountError for a blocked athlete member and keeps them an athlete", async () => {
      const { repo, adminId, athleteId, orgId, blockUser } = await clubWithAthlete();
      await blockUser(athleteId);

      await expect(repo.assignManager(adminId, orgId, athleteId)).rejects.toBeInstanceOf(
        BlockedAccountError,
      );
      expect(await repo.listManagerIds(orgId)).not.toContain(athleteId);
    });

    it("removeManager does not count a blocked Manager as another Manager", async () => {
      const { repo, adminId, managerId, athleteId, orgId, blockUser } = await clubWithAthlete();
      await repo.assignManager(adminId, orgId, athleteId);
      await blockUser(athleteId);

      await expect(repo.removeManager(adminId, orgId, managerId)).rejects.toBeInstanceOf(
        LastManagerError,
      );
      expect((await repo.listManagerIds(orgId)).sort()).toEqual([managerId, athleteId].sort());
    });

    it("removeManager can remove a blocked Manager while an active one remains", async () => {
      const { repo, adminId, managerId, athleteId, orgId, blockUser } = await clubWithAthlete();
      await repo.assignManager(adminId, orgId, athleteId);
      await blockUser(athleteId);

      await repo.removeManager(adminId, orgId, athleteId);

      expect(await repo.listManagerIds(orgId)).toEqual([managerId]);
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

    // Invitations and requests to join a club
    describe("membership requests", () => {
      async function setup() {
        const fixture = createFixture();
        const { repo, createClub, createUsers, addAthlete } = fixture;
        const orgId = await createClub(newClub({ members: 0 }));
        const [managerId, otherManagerId, userId, memberId] = await createUsers(4);
        await repo.assignManager(managerId, orgId, managerId);
        await repo.assignManager(managerId, orgId, otherManagerId);
        await addAthlete(orgId, memberId);
        return { ...fixture, orgId, managerId, otherManagerId, userId, memberId };
      }

      const memberCount = async (repo: OrganizationRepository, orgId: string) =>
        (await repo.listCatalog()).find((club) => club.id === orgId)?.memberCount;

      it("inviteUser creates a pending invite by the Manager and notifies only the invitee", async () => {
        const { repo, sent, orgId, managerId, userId } = await setup();

        const invitation = await repo.inviteUser(managerId, orgId, userId);

        expect(invitation).toMatchObject({ orgId, userId, kind: "invite", status: "pending", createdBy: managerId });
        expect(sent()).toEqual([
          { userId, type: MEMBERSHIP_INVITATION_CREATED, payload: { orgId, requestId: invitation.id } },
        ]);
        expect(await repo.listPendingRequests(orgId)).toEqual([]);
      });

      it("requestToJoin creates a pending request and notifies every Manager", async () => {
        const { repo, sent, orgId, managerId, otherManagerId, userId } = await setup();

        const request = await repo.requestToJoin(userId, orgId);

        expect(request).toMatchObject({ orgId, userId, kind: "request", status: "pending", createdBy: userId });
        expect(sent().map((n) => n.userId).sort()).toEqual([managerId, otherManagerId].sort());
        expect(sent().every((n) => n.type === MEMBERSHIP_REQUEST_CREATED)).toBe(true);
        expect((await repo.listPendingRequests(orgId)).map((r) => r.id)).toEqual([request.id]);
      });

      for (const operation of ["inviteUser", "requestToJoin"] as const) {
        const call = (repo: OrganizationRepository, managerId: string, orgId: string, userId: string) =>
          operation === "inviteUser" ? repo.inviteUser(managerId, orgId, userId) : repo.requestToJoin(userId, orgId);

        it(`${operation} throws AlreadyMemberError for a member and creates nothing`, async () => {
          const { repo, sent, orgId, managerId, memberId } = await setup();

          await expect(call(repo, managerId, orgId, memberId)).rejects.toBeInstanceOf(AlreadyMemberError);
          expect(sent()).toEqual([]);
        });

        it(`${operation} throws RequestAlreadyPendingError if one is pending, of either kind`, async () => {
          const { repo, sent, orgId, managerId, userId } = await setup();
          await repo.inviteUser(managerId, orgId, userId);
          const before = sent().length;

          await expect(call(repo, managerId, orgId, userId)).rejects.toBeInstanceOf(RequestAlreadyPendingError);
          expect(sent()).toHaveLength(before);
        });

        it(`${operation} throws OrganizationDeletionAlreadyScheduledError during the deletion notice and creates nothing`, async () => {
          const { repo, sent, orgId, managerId, userId } = await setup();
          await repo.scheduleDeletion(managerId, orgId);
          const before = sent().length;

          await expect(call(repo, managerId, orgId, userId)).rejects.toBeInstanceOf(
            OrganizationDeletionAlreadyScheduledError,
          );
          expect(sent()).toHaveLength(before);
          expect(await repo.listPendingRequests(orgId)).toEqual([]);
        });

        it(`${operation} treats a blocked user like a missing one`, async () => {
          const { repo, blockUser, orgId, managerId, userId } = await setup();
          await blockUser(userId);

          await expect(call(repo, managerId, orgId, userId)).rejects.toBeInstanceOf(UserNotFoundError);
          await expect(call(repo, managerId, orgId, UNKNOWN_ID)).rejects.toBeInstanceOf(UserNotFoundError);
        });

        it(`${operation} throws OrganizationNotFoundError if the club does not exist`, async () => {
          const { repo, managerId, userId } = await setup();

          await expect(call(repo, managerId, UNKNOWN_ID, userId)).rejects.toBeInstanceOf(
            OrganizationNotFoundError,
          );
        });

        it(`${operation} allows a new one after the previous was rejected`, async () => {
          const { repo, orgId, managerId, userId } = await setup();
          const first = await call(repo, managerId, orgId, userId);
          if (first.kind === "invite") await repo.answerInvitation(userId, first.id, false);
          else await repo.reviewRequest(orgId, first.id, false);

          const second = await call(repo, managerId, orgId, userId);

          expect(second.id).not.toBe(first.id);
          expect(second.status).toBe("pending");
        });
      }

      it("reviewRequest(approve) throws UserNotFoundError for a user blocked after asking, and leaves it pending", async () => {
        const { repo, blockUser, orgId, userId } = await setup();
        const request = await repo.requestToJoin(userId, orgId);
        const before = await memberCount(repo, orgId);
        await blockUser(userId);

        await expect(repo.reviewRequest(orgId, request.id, true)).rejects.toBeInstanceOf(UserNotFoundError);

        expect(await memberCount(repo, orgId)).toBe(before);
        expect((await repo.listPendingRequests(orgId)).map((r) => r.id)).toEqual([request.id]);
      });

      it("answerInvitation(accept) throws UserNotFoundError for a user blocked after being invited", async () => {
        const { repo, blockUser, orgId, managerId, userId } = await setup();
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        const before = await memberCount(repo, orgId);
        await blockUser(userId);

        await expect(repo.answerInvitation(userId, invitation.id, true)).rejects.toBeInstanceOf(UserNotFoundError);

        expect(await memberCount(repo, orgId)).toBe(before);
      });

      it("answerInvitation(accept) makes the user an athlete and notifies the Manager who invited", async () => {
        const { repo, sent, orgId, managerId, userId } = await setup();
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        const before = await memberCount(repo, orgId);

        await repo.answerInvitation(userId, invitation.id, true);

        expect(await memberCount(repo, orgId)).toBe((before ?? 0) + 1);
        expect(sent().at(-1)).toEqual({
          userId: managerId,
          type: MEMBERSHIP_ACCEPTED,
          payload: { orgId, requestId: invitation.id, userId },
        });
        await expect(repo.inviteUser(managerId, orgId, userId)).rejects.toBeInstanceOf(AlreadyMemberError);
      });

      it("answerInvitation(reject) joins nobody and notifies nobody", async () => {
        const { repo, sent, orgId, managerId, userId } = await setup();
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        const before = { count: await memberCount(repo, orgId), sent: sent().length };

        await repo.answerInvitation(userId, invitation.id, false);

        expect(await memberCount(repo, orgId)).toBe(before.count);
        expect(sent()).toHaveLength(before.sent);
      });

      it("reviewRequest(approve) makes the user an athlete and notifies them; reject does neither", async () => {
        const { repo, sent, orgId, userId, createUsers } = await setup();
        const [otherUser] = await createUsers(1);
        const approved = await repo.requestToJoin(userId, orgId);
        const rejected = await repo.requestToJoin(otherUser, orgId);
        const before = await memberCount(repo, orgId);
        const sentBefore = sent().length;

        await repo.reviewRequest(orgId, approved.id, true);
        await repo.reviewRequest(orgId, rejected.id, false);

        expect(await memberCount(repo, orgId)).toBe((before ?? 0) + 1);
        expect(sent().slice(sentBefore)).toEqual([
          { userId, type: MEMBERSHIP_ACCEPTED, payload: { orgId, requestId: approved.id, userId } },
        ]);
        expect(await repo.listPendingRequests(orgId)).toEqual([]);
      });

      it("a second decision on the same request throws MembershipRequestNotPendingError", async () => {
        const { repo, orgId, userId } = await setup();
        const request = await repo.requestToJoin(userId, orgId);
        await repo.reviewRequest(orgId, request.id, true);

        await expect(repo.reviewRequest(orgId, request.id, false)).rejects.toBeInstanceOf(
          MembershipRequestNotPendingError,
        );
        await expect(repo.withdrawRequest(userId, request.id)).rejects.toBeInstanceOf(
          MembershipRequestNotPendingError,
        );
      });

      it("a request that is not the caller's is not found, same as one that does not exist", async () => {
        const { repo, orgId, managerId, userId, createClub, createUsers } = await setup();
        const [stranger] = await createUsers(1);
        const otherClub = await createClub(newClub({ members: 0 }));
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        const request = await repo.requestToJoin(stranger, orgId);

        // Wrong user, wrong club, wrong kind, and unknown id
        await expect(repo.answerInvitation(stranger, invitation.id, true)).rejects.toBeInstanceOf(MembershipRequestNotFoundError);
        await expect(repo.revokeInvitation(otherClub, invitation.id)).rejects.toBeInstanceOf(MembershipRequestNotFoundError);
        await expect(repo.reviewRequest(orgId, invitation.id, true)).rejects.toBeInstanceOf(MembershipRequestNotFoundError);
        await expect(repo.answerInvitation(stranger, request.id, true)).rejects.toBeInstanceOf(MembershipRequestNotFoundError);
        await expect(repo.withdrawRequest(userId, request.id)).rejects.toBeInstanceOf(MembershipRequestNotFoundError);
        await expect(repo.reviewRequest(orgId, UNKNOWN_ID, true)).rejects.toBeInstanceOf(MembershipRequestNotFoundError);
        // None of that decided anything
        expect(await repo.listPendingRequests(orgId)).toHaveLength(1);
      });

      it("revokeInvitation and withdrawRequest end the pending row without notifying", async () => {
        const { repo, sent, orgId, managerId, userId, createUsers } = await setup();
        const [other] = await createUsers(1);
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        const request = await repo.requestToJoin(other, orgId);
        const sentBefore = sent().length;

        await repo.revokeInvitation(orgId, invitation.id);
        await repo.withdrawRequest(other, request.id);

        expect(sent()).toHaveLength(sentBefore);
        expect(await repo.listPendingRequests(orgId)).toEqual([]);
        await expect(repo.answerInvitation(userId, invitation.id, true)).rejects.toBeInstanceOf(MembershipRequestNotPendingError);
      });

      it("accepting after joining by another way throws AlreadyMemberError and leaves the invitation pending", async () => {
        const { repo, addAthlete, orgId, managerId, userId } = await setup();
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        await addAthlete(orgId, userId);

        await expect(repo.answerInvitation(userId, invitation.id, true)).rejects.toBeInstanceOf(AlreadyMemberError);
        await repo.revokeInvitation(orgId, invitation.id);
      });

      it("listPendingRequests returns the club's pending requests oldest first", async () => {
        const { repo, orgId, userId, createUsers } = await setup();
        const [second] = await createUsers(1);
        const first = await repo.requestToJoin(userId, orgId);
        const last = await repo.requestToJoin(second, orgId);

        expect((await repo.listPendingRequests(orgId)).map((r) => r.id)).toEqual([first.id, last.id]);
      });

      it("listUserRequests returns the user's own invitations and requests with the club name, of every status", async () => {
        const { repo, orgId, managerId, userId, createUsers, createClub } = await setup();
        const [other] = await createUsers(1);
        const otherOrgId = await createClub(newClub({ members: 0 }));
        const invitation = await repo.inviteUser(managerId, orgId, userId);
        const rejected = await repo.requestToJoin(userId, otherOrgId);
        await repo.reviewRequest(otherOrgId, rejected.id, false);
        await repo.requestToJoin(other, orgId);
        const clubName = (id: string) => repo.listCatalog().then((clubs) => clubs.find((club) => club.id === id)?.name);

        const own = await repo.listUserRequests(userId);

        expect(own.map((r) => r.id).sort()).toEqual([invitation.id, rejected.id].sort());
        expect(own.find((r) => r.id === invitation.id)).toMatchObject({
          orgId,
          orgName: await clubName(orgId),
          kind: "invite",
          status: "pending",
        });
        expect(own.find((r) => r.id === rejected.id)).toMatchObject({
          orgId: otherOrgId,
          orgName: await clubName(otherOrgId),
          kind: "request",
          status: "rejected",
        });
      });

      it("hasClub is true for a member of any club and false for a user with none", async () => {
        const { repo, managerId, userId, memberId } = await setup();

        expect(await repo.hasClub(managerId)).toBe(true);
        expect(await repo.hasClub(memberId)).toBe(true);
        expect(await repo.hasClub(userId)).toBe(false);
        expect(await repo.hasClub(UNKNOWN_ID)).toBe(false);
      });

      it("listUserClubs returns the user's clubs by name with their role and whether they are the last Manager", async () => {
        const { repo, createClub, orgId, managerId, otherManagerId, memberId } = await setup();
        const second = await createClub(newClub({ name: "Zeta club", members: 0 }));
        await repo.assignManager(managerId, second, managerId);

        const mine = await repo.listUserClubs(managerId);

        // setup() names its club "Club de prueba N", which sorts before "Zeta club"
        expect(mine.map((club) => club.orgId)).toEqual([orgId, second]);
        expect(mine.find((club) => club.orgId === orgId)).toMatchObject({ role: "manager", isLastManager: false });
        expect(mine.find((club) => club.orgId === second)).toMatchObject({ role: "manager", isLastManager: true });
        expect(await repo.listUserClubs(memberId)).toMatchObject([{ orgId, role: "athlete", isLastManager: false }]);
        expect((await repo.listUserClubs(otherManagerId)).map((club) => club.orgId)).toEqual([orgId]);
      });

      it("listUserClubs is empty for a user with none", async () => {
        const { repo, userId } = await setup();

        expect(await repo.listUserClubs(userId)).toEqual([]);
        expect(await repo.listUserClubs(UNKNOWN_ID)).toEqual([]);
      });

      it("listUserRequests is empty for a user with none", async () => {
        const { repo, userId } = await setup();

        expect(await repo.listUserRequests(userId)).toEqual([]);
      });
    });

    // Scheduled deletion (#217): both implementations count 30 days from `now`
    describe("scheduled deletion", () => {
      async function setup() {
        const fixture = createFixture();
        const orgId = await fixture.createClub(newClub({ members: 0 }));
        const [adminId] = await fixture.createUsers(1);
        return { ...fixture, orgId, adminId };
      }

      it("scheduleDeletion sets deleteAt 30 days after now and returns the club name", async () => {
        const { repo, orgId, adminId } = await setup();
        const now = new Date("2026-01-01T10:00:00Z");

        const result = await repo.scheduleDeletion(adminId, orgId, now);

        expect(result.orgId).toBe(orgId);
        expect(result.deleteAt).toEqual(new Date("2026-01-31T10:00:00Z"));
      });

      it("scheduleDeletion throws OrganizationDeletionAlreadyScheduledError the second time", async () => {
        const { repo, orgId, adminId } = await setup();
        await repo.scheduleDeletion(adminId, orgId);

        await expect(repo.scheduleDeletion(adminId, orgId)).rejects.toBeInstanceOf(
          OrganizationDeletionAlreadyScheduledError,
        );
      });

      it("scheduleDeletion throws OrganizationNotFoundError for a missing club", async () => {
        const { repo, adminId } = await setup();

        await expect(repo.scheduleDeletion(adminId, UNKNOWN_ID)).rejects.toBeInstanceOf(
          OrganizationNotFoundError,
        );
      });

      it("cancelDeletion clears the schedule, so it can be scheduled again", async () => {
        const { repo, orgId, adminId } = await setup();
        await repo.scheduleDeletion(adminId, orgId);

        await repo.cancelDeletion(adminId, orgId);

        await expect(repo.scheduleDeletion(adminId, orgId)).resolves.toMatchObject({ orgId });
      });

      it("cancelDeletion throws OrganizationDeletionNotScheduledError if nothing is scheduled", async () => {
        const { repo, orgId, adminId } = await setup();

        await expect(repo.cancelDeletion(adminId, orgId)).rejects.toBeInstanceOf(
          OrganizationDeletionNotScheduledError,
        );
      });
    });
  });
}
