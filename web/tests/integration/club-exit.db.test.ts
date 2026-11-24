// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { CannotExpelSelfError, NotMemberError, PrismaClubExit, type CancelPendingContacts } from "@/lib/org/club-exit";
import { PrismaEventRepository } from "@/lib/events/event-repository";
import { eventIdOf } from "../support/event-repository-contract";
import { withLockHarness } from "../support/lock-harness";
import type { Notify } from "@/lib/org/club-without-manager";

const PREFIX = "club-exit-";
let counter = 0;

async function createUser(roleGlobal: "user" | "admin" = "user"): Promise<string> {
  const user = await prisma.user.create({ data: { email: `${PREFIX}${counter++}@example.com`, roleGlobal } });
  return user.id;
}

// A club with one Group; members is [userId, role] and every member joins the Group
async function createClub(members: [string, "athlete" | "manager"][]) {
  const club = await prisma.organization.create({
    data: {
      name: `${PREFIX}${counter++}`,
      timezone: "Europe/Madrid",
      memberships: { create: members.map(([userId, role]) => ({ userId, role })) },
      groups: {
        create: { name: "Group", members: { create: members.map(([userId]) => ({ userId })) } },
      },
    },
    include: { groups: true },
  });
  return { orgId: club.id, groupId: club.groups[0].id };
}

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaClubExit.leave", () => {
  it("removes the membership and the Group rows of that club only", async () => {
    const athlete = await createUser();
    const manager = await createUser();
    const club = await createClub([[athlete, "athlete"], [manager, "manager"]]);
    const other = await createClub([[athlete, "athlete"], [manager, "manager"]]);

    await new PrismaClubExit(prisma).leave(athlete, club.orgId);

    expect(await prisma.membership.findMany({ where: { userId: athlete } })).toMatchObject([{ orgId: other.orgId }]);
    expect(await prisma.groupMember.findMany({ where: { userId: athlete } })).toMatchObject([{ groupId: other.groupId }]);
  });

  // Only this test's Admins and club: other files share the database and every Admin in it
  async function notices(adminIds: string[], orgId: string) {
    const rows = await prisma.notification.findMany({
      where: { type: "club_without_manager", userId: { in: adminIds } },
    });
    return rows.filter((row) => (row.payload as { orgId: string }).orgId === orgId).map((row) => row.userId);
  }

  it("lets the last Manager leave and warns every Admin", async () => {
    const [adminA, adminB, manager] = [await createUser("admin"), await createUser("admin"), await createUser()];
    const club = await createClub([[manager, "manager"]]);

    await new PrismaClubExit(prisma).leave(manager, club.orgId);

    expect(await prisma.membership.count({ where: { orgId: club.orgId } })).toBe(0);
    expect((await notices([adminA, adminB], club.orgId)).sort()).toEqual([adminA, adminB].sort());
  });

  it("cancels pending Contacts after the Group and club rows are gone, in the same transaction", async () => {
    const athlete = await createUser();
    const club = await createClub([[athlete, "athlete"]]);
    const seen: { userId: string; memberships: number; groupMembers: number }[] = [];
    const cancelPendingContacts: CancelPendingContacts = async (tx, userId) => {
      // Read through the transaction the port receives: the removal is not committed yet
      seen.push({
        userId,
        memberships: await tx.membership.count({ where: { userId } }),
        groupMembers: await tx.groupMember.count({ where: { userId } }),
      });
      return 0;
    };

    await new PrismaClubExit(prisma, { cancelPendingContacts }).leave(athlete, club.orgId);

    expect(seen).toEqual([{ userId: athlete, memberships: 0, groupMembers: 0 }]);
  });

  it("withdraws the user's spots in upcoming Events and takes them out of the chat", async () => {
    const [manager, athlete] = [await createUser(), await createUser()];
    const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
    const repository = new PrismaEventRepository(prisma);
    const now = new Date();
    const startsAt = new Date(now.getTime() + 24 * 3600_000);
    const event = { title: "Rodaje", location: "Parque", startsAt, sessionId: null };
    const pendingId = eventIdOf(await repository.createEvent(club.orgId, manager, event, now));
    const approvedId = eventIdOf(await repository.createEvent(club.orgId, manager, event, now));
    await repository.requestSpot(club.orgId, pendingId, athlete, now);
    await repository.requestSpot(club.orgId, approvedId, athlete, now);
    await repository.approveSpot(club.orgId, approvedId, athlete, now);

    await new PrismaClubExit(prisma).leave(athlete, club.orgId);

    const requests = await prisma.spotRequest.findMany({ where: { userId: athlete } });
    expect(requests.map((request) => request.status)).toEqual(["withdrawn", "withdrawn"]);
    const chat = await prisma.conversationParticipant.findMany({ where: { userId: athlete } });
    expect(chat).toHaveLength(1);
    expect(chat[0].removedAt).not.toBeNull();
  });

  it("does not warn when an Athlete leaves a club that has no Manager", async () => {
    const [admin, athlete] = [await createUser("admin"), await createUser()];
    const club = await createClub([[athlete, "athlete"]]);

    await new PrismaClubExit(prisma).leave(athlete, club.orgId);

    expect(await notices([admin], club.orgId)).toEqual([]);
  });

  it("rejects with NotMemberError when the user is not in the club, and changes nothing", async () => {
    const [stranger, member] = [await createUser(), await createUser()];
    const club = await createClub([[member, "manager"]]);
    let called = false;
    const cancelPendingContacts: CancelPendingContacts = async () => ((called = true), 0);

    await expect(new PrismaClubExit(prisma, { cancelPendingContacts }).leave(stranger, club.orgId)).rejects.toBeInstanceOf(
      NotMemberError,
    );

    expect(called).toBe(false);
    expect(await prisma.membership.count({ where: { orgId: club.orgId } })).toBe(1);
  });

  it("does not warn when another Manager stays", async () => {
    const [admin, managerA, managerB] = [await createUser("admin"), await createUser(), await createUser()];
    const club = await createClub([[managerA, "manager"], [managerB, "manager"]]);

    await new PrismaClubExit(prisma).leave(managerA, club.orgId);

    expect(await notices([admin], club.orgId)).toEqual([]);
  });
});

describe("PrismaClubExit.expel", () => {
  // A fake notify with the signature of #153 that records what it was asked to send
  function fakeNotify() {
    const calls: { userId: string; type: string; payload: Record<string, string> }[] = [];
    const notify: Notify = async (_tx, input) => (calls.push(input), null);
    return { calls, notify };
  }

  it("lets a Manager expel an Athlete, removes the rows and notifies the expelled one", async () => {
    const [manager, athlete] = [await createUser(), await createUser()];
    const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
    const { calls, notify } = fakeNotify();

    await new PrismaClubExit(prisma, { notify }).expel({ id: manager, role: "manager" }, club.orgId, athlete);

    expect(await prisma.membership.findMany({ where: { userId: athlete } })).toEqual([]);
    expect(await prisma.groupMember.findMany({ where: { userId: athlete } })).toEqual([]);
    expect(calls).toEqual([{ userId: athlete, type: "membership_removed", payload: { orgId: club.orgId } }]);
  });

  it("withdraws the expelled user's spots in upcoming Events", async () => {
    const [manager, athlete] = [await createUser(), await createUser()];
    const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
    const repository = new PrismaEventRepository(prisma);
    const now = new Date();
    const startsAt = new Date(now.getTime() + 24 * 3600_000);
    const eventId = eventIdOf(
      await repository.createEvent(club.orgId, manager, { title: "Rodaje", location: "Parque", startsAt, sessionId: null }, now),
    );
    await repository.requestSpot(club.orgId, eventId, athlete, now);
    await repository.approveSpot(club.orgId, eventId, athlete, now);

    await new PrismaClubExit(prisma, { notify: fakeNotify().notify }).expel({ id: manager, role: "manager" }, club.orgId, athlete);

    const request = await prisma.spotRequest.findFirstOrThrow({ where: { userId: athlete } });
    expect(request.status).toBe("withdrawn");
    const chat = await prisma.conversationParticipant.findFirstOrThrow({ where: { userId: athlete } });
    expect(chat.removedAt).not.toBeNull();
  });

  async function auditRows(targetId: string) {
    return prisma.auditLog.findMany({ where: { subjectId: targetId, resource: "membership" } });
  }

  it("records the audit row when an Admin expels, and none when a Manager does", async () => {
    const [admin, manager, athleteA, athleteB] = [
      await createUser("admin"),
      await createUser(),
      await createUser(),
      await createUser(),
    ];
    const club = await createClub([[manager, "manager"], [athleteA, "athlete"], [athleteB, "athlete"]]);
    const { notify } = fakeNotify();
    const exit = new PrismaClubExit(prisma, { notify });

    await exit.expel({ id: admin, role: "admin" }, club.orgId, athleteA);
    await exit.expel({ id: manager, role: "manager" }, club.orgId, athleteB);

    expect(await auditRows(athleteA)).toMatchObject([
      { actorId: admin, actorRole: "admin", action: "delete", resource: "membership", resourceId: club.orgId },
    ]);
    expect(await auditRows(athleteB)).toEqual([]);
  });

  it("lets a Manager expel the last Manager and warns every Admin", async () => {
    const [admin, managerA, managerB] = [await createUser("admin"), await createUser(), await createUser()];
    const club = await createClub([[managerA, "manager"], [managerB, "manager"]]);
    const { calls, notify } = fakeNotify();

    await new PrismaClubExit(prisma, { notify }).expel({ id: managerA, role: "manager" }, club.orgId, managerB);
    // managerA is still there: expelling managerB left a Manager, so no warning yet
    expect(calls.filter((call) => call.type === "club_without_manager")).toEqual([]);

    await new PrismaClubExit(prisma, { notify }).expel({ id: admin, role: "admin" }, club.orgId, managerA);
    expect(calls.filter((call) => call.type === "club_without_manager")).toEqual([
      { userId: admin, type: "club_without_manager", payload: { orgId: club.orgId } },
    ]);
  });

  it("rejects the second of two expulsions with NotMemberError and notifies only once", async () => {
    const [manager, athlete] = [await createUser(), await createUser()];
    const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
    const { calls, notify } = fakeNotify();
    const exit = new PrismaClubExit(prisma, { notify });

    await exit.expel({ id: manager, role: "manager" }, club.orgId, athlete);
    await expect(exit.expel({ id: manager, role: "manager" }, club.orgId, athlete)).rejects.toBeInstanceOf(NotMemberError);

    expect(calls).toHaveLength(1);
  });

  it("does not let an actor expel themself (that is leave)", async () => {
    const manager = await createUser();
    const club = await createClub([[manager, "manager"]]);

    await expect(
      new PrismaClubExit(prisma).expel({ id: manager, role: "manager" }, club.orgId, manager),
    ).rejects.toBeInstanceOf(CannotExpelSelfError);

    expect(await prisma.membership.count({ where: { orgId: club.orgId } })).toBe(1);
  });
});

describe("PrismaClubExit races", () => {
  it("warns the Admin exactly once when the only two Managers leave at the same time", async () => {
    const [admin, managerA, managerB] = [await createUser("admin"), await createUser(), await createUser()];
    const club = await createClub([[managerA, "manager"], [managerB, "manager"]]);

    const results = await withLockHarness(async (harness) => {
      // G holds the club row: each exit locks its own user, then waits for the club
      const gate = await harness.holdLock("gate", (tx) =>
        tx.$queryRaw`SELECT id FROM organizations WHERE id = ${club.orgId}::uuid FOR UPDATE`,
      );
      const clientA = harness.client("leave-a");
      const clientB = harness.client("leave-b");
      const leaveA = harness.track(new PrismaClubExit(clientA.db).leave(managerA, club.orgId));
      const leaveB = harness.track(new PrismaClubExit(clientB.db).leave(managerB, club.orgId));

      await harness.waitUntilWaiting(gate, [
        { name: "leave A", client: clientA, queryFragment: "FROM organizations" },
        { name: "leave B", client: clientB, queryFragment: "FROM organizations" },
      ]);

      gate.release();
      return Promise.allSettled([leaveA, leaveB]);
    });

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await prisma.membership.count({ where: { orgId: club.orgId } })).toBe(0);
    const warnings = await prisma.notification.findMany({ where: { type: "club_without_manager", userId: admin } });
    expect(warnings.filter((row) => (row.payload as { orgId: string }).orgId === club.orgId)).toHaveLength(1);
  });
});
