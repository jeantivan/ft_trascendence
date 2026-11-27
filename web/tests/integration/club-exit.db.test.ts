// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { CannotExpelSelfError, NotMemberError, PrismaClubExit, type CancelPendingContacts } from "@/lib/org/club-exit";
import { PrismaEventRepository } from "@/lib/events/event-repository";
import { eventIdOf } from "../support/event-repository-contract";
import { orderedPair } from "@/lib/social/contact-pair";
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

const repository = new PrismaEventRepository(prisma);
const HOUR = 3_600_000;

// An Event of the club that starts in 24 hours, with the user's spot request in the given state
async function seedSpot(
  orgId: string,
  managerId: string,
  userId: string,
  status: "pending" | "approved" | "rejected",
): Promise<string> {
  const now = new Date();
  const event = { title: "Rodaje", location: "Parque", startsAt: new Date(now.getTime() + 24 * HOUR), sessionId: null };
  const eventId = eventIdOf(await repository.createEvent(orgId, managerId, event, now));
  expect(await repository.requestSpot(orgId, eventId, userId, now)).toMatchObject({ ok: true });
  if (status === "approved") expect(await repository.approveSpot(orgId, eventId, userId, now)).toMatchObject({ ok: true });
  if (status === "rejected") expect(await repository.rejectSpot(orgId, eventId, userId, now)).toMatchObject({ ok: true });
  return eventId;
}

async function spotStatus(eventId: string, userId: string) {
  return (await prisma.spotRequest.findUnique({ where: { eventId_userId: { eventId, userId } } }))?.status;
}

function chatOf(eventId: string, userId: string) {
  return prisma.conversationParticipant.findFirst({ where: { userId, conversation: { eventId } } });
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

  it("revokes the club's pending invitations to the user, and only those", async () => {
    const [manager, athlete] = [await createUser(), await createUser()];
    const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
    const other = await createClub([[manager, "manager"]]);
    const invite = (orgId: string, status: "pending" | "rejected") =>
      prisma.membershipRequest.create({ data: { orgId, userId: athlete, kind: "invite", status, createdBy: manager } });
    const pending = await invite(club.orgId, "pending");
    const rejected = await invite(club.orgId, "rejected");
    const inOther = await invite(other.orgId, "pending");

    await new PrismaClubExit(prisma).leave(athlete, club.orgId);

    const statusOf = async (id: string) => (await prisma.membershipRequest.findUniqueOrThrow({ where: { id } })).status;
    expect(await statusOf(pending.id)).toBe("revoked");
    expect(await statusOf(rejected.id)).toBe("rejected");
    expect(await statusOf(inOther.id)).toBe("pending");
  });

  describe("spots in Events", () => {
    const exitAt = new Date(Date.now() + 48 * HOUR);

    it("withdraws pending and approved spots and takes the user out of the chat", async () => {
      const [manager, athlete] = [await createUser(), await createUser()];
      const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
      const pending = await seedSpot(club.orgId, manager, athlete, "pending");
      const approved = await seedSpot(club.orgId, manager, athlete, "approved");

      await new PrismaClubExit(prisma).leave(athlete, club.orgId);

      expect(await spotStatus(pending, athlete)).toBe("withdrawn");
      expect(await spotStatus(approved, athlete)).toBe("withdrawn");
      expect((await chatOf(approved, athlete))?.removedAt).not.toBeNull();
    });

    it("also withdraws a Manager's spots when the Manager leaves", async () => {
      const [manager, otherManager] = [await createUser(), await createUser()];
      const club = await createClub([[manager, "manager"], [otherManager, "manager"]]);
      const eventId = await seedSpot(club.orgId, otherManager, manager, "pending");

      await new PrismaClubExit(prisma).leave(manager, club.orgId);

      expect(await spotStatus(eventId, manager)).toBe("withdrawn");
    });

    it("leaves a rejected request rejected, and the spots in another club untouched", async () => {
      const [manager, athlete] = [await createUser(), await createUser()];
      const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
      const other = await createClub([[manager, "manager"], [athlete, "athlete"]]);
      const rejected = await seedSpot(club.orgId, manager, athlete, "rejected");
      const inOther = await seedSpot(other.orgId, manager, athlete, "approved");

      await new PrismaClubExit(prisma).leave(athlete, club.orgId);

      expect(await spotStatus(rejected, athlete)).toBe("rejected");
      expect(await spotStatus(inOther, athlete)).toBe("approved");
      expect((await chatOf(inOther, athlete))?.removedAt).toBeNull();
    });

    it("leaves an Event that has already started as it was", async () => {
      const [manager, athlete] = [await createUser(), await createUser()];
      const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
      const eventId = await seedSpot(club.orgId, manager, athlete, "approved");

      await new PrismaClubExit(prisma, { now: () => exitAt }).leave(athlete, club.orgId);

      expect(await spotStatus(eventId, athlete)).toBe("approved");
      expect((await chatOf(eventId, athlete))?.removedAt).toBeNull();
    });

    it("leaves a cancelled Event as it was", async () => {
      const [manager, athlete] = [await createUser(), await createUser()];
      const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
      const eventId = await seedSpot(club.orgId, manager, athlete, "approved");
      expect(await repository.cancelEvent(club.orgId, eventId, new Date())).toMatchObject({ ok: true });

      await new PrismaClubExit(prisma).leave(athlete, club.orgId);

      expect(await spotStatus(eventId, athlete)).toBe("approved");
    });
  });

  it("deletes a pending Contact with a Group mate by default, and keeps an accepted one (#154)", async () => {
    const [athlete, pendingMate, acceptedMate] = [await createUser(), await createUser(), await createUser()];
    const club = await createClub([[athlete, "athlete"], [pendingMate, "athlete"], [acceptedMate, "athlete"]]);
    await prisma.contact.createMany({
      data: [
        { ...orderedPair(athlete, pendingMate), requestedBy: athlete, status: "pending" },
        { ...orderedPair(athlete, acceptedMate), requestedBy: athlete, status: "accepted" },
      ],
    });

    await new PrismaClubExit(prisma).leave(athlete, club.orgId);

    const left = await prisma.contact.findMany({ where: { OR: [{ userA: athlete }, { userB: athlete }] } });
    expect(left).toMatchObject([{ status: "accepted" }]);
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
    const eventId = await seedSpot(club.orgId, manager, athlete, "approved");

    await new PrismaClubExit(prisma, { notify: fakeNotify().notify }).expel(
      { id: manager, role: "manager" },
      club.orgId,
      athlete,
    );

    expect(await spotStatus(eventId, athlete)).toBe("withdrawn");
    expect((await chatOf(eventId, athlete))?.removedAt).not.toBeNull();
  });

  it("revokes the expelled user's pending invitations from the club", async () => {
    const [manager, athlete] = [await createUser(), await createUser()];
    const club = await createClub([[manager, "manager"], [athlete, "athlete"]]);
    const invitation = await prisma.membershipRequest.create({
      data: { orgId: club.orgId, userId: athlete, kind: "invite", status: "pending", createdBy: manager },
    });

    await new PrismaClubExit(prisma, { notify: fakeNotify().notify }).expel(
      { id: manager, role: "manager" },
      club.orgId,
      athlete,
    );

    expect((await prisma.membershipRequest.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("revoked");
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
