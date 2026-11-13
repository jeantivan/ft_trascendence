// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/audit/record-admin-action";
import { CLUB_WITHOUT_MANAGER, deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { issueDeleteCode } from "../support/delete-account-helper";
import { withLockHarness } from "../support/lock-harness";
import {
  AlreadyManagerError,
  LastManagerError,
  NotManagerError,
  OrganizationNotFoundError,
  PrismaOrganizationRepository,
  UserNotFoundError,
} from "@/lib/org/organization-repository";
import {
  runOrganizationRepositoryContract,
  type NewClub,
} from "../support/organization-repository-contract";

// Delegates to the real function; a test replaces it once to make the audit write fail
vi.mock("@/lib/audit/record-admin-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/record-admin-action")>();
  return { ...actual, recordAdminAction: vi.fn(actual.recordAdminAction) };
});

const PREFIX = "organization-repository-";
const repository = new PrismaOrganizationRepository(prisma);
// Clubs made with createClub are cleaned up by id
const clubIds: string[] = [];
let userCount = 0;

// A real club needs real users for its members (memberships have foreign keys)
async function createUsers(count: number): Promise<string[]> {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: { email: `${PREFIX}${userCount++}@example.com` },
    });
    ids.push(user.id);
  }
  return ids;
}

async function createClub(club: NewClub): Promise<string> {
  const userIds = await createUsers(club.members);
  const members = userIds.map((userId) => ({ userId, role: "athlete" as const }));
  const created = await prisma.organization.create({
    data: {
      name: club.name,
      description: club.description,
      timezone: club.timezone,
      memberships: { create: members },
    },
  });
  clubIds.push(created.id);
  return created.id;
}

// Makes an existing user an athlete member of an existing club
async function addAthlete(orgId: string, userId: string): Promise<void> {
  await prisma.membership.create({ data: { orgId, userId, role: "athlete" } });
}

afterEach(async () => {
  // A mockImplementationOnce that no call consumed must not reach the next test, and
  // mockClear would keep it. mockReset drops it and goes back to the real recordAdminAction
  vi.mocked(recordAdminAction).mockReset();
  // Deleting the clubs and users also deletes their memberships (onDelete: Cascade).
  // Clubs made by createWithManagers are not in clubIds: they are found through
  // their members, before the users (and with them the memberships) go away
  await prisma.organization.deleteMany({
    where: {
      OR: [
        { id: { in: clubIds } },
        { memberships: { some: { user: { email: { startsWith: PREFIX } } } } },
      ],
    },
  });
  // audit_log has no foreign key to users, so its rows stay behind unless deleted by actor
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  clubIds.length = 0;
});
afterAll(async () => {
  await prisma.$disconnect();
});

runOrganizationRepositoryContract("Prisma", () => ({
  repo: repository,
  createClub,
  createUsers,
  addAthlete,
}));

// What the contract cannot see: roles and audit rows only exist in the database
describe("PrismaOrganizationRepository.createWithManagers", () => {
  const CLUB = {
    name: "Club de prueba",
    description: null,
    timezone: "Europe/Madrid",
  };

  it("leaves each initial Manager with the manager role", async () => {
    const [adminId, managerA, managerB] = await createUsers(3);

    const club = await repository.createWithManagers(adminId, {
      ...CLUB,
      managerIds: [managerA, managerB],
    });

    const memberships = await prisma.membership.findMany({ where: { orgId: club.id } });
    expect(memberships.map((m) => [m.userId, m.role]).sort()).toEqual(
      [
        [managerA, "manager"],
        [managerB, "manager"],
      ].sort(),
    );
  });

  it("writes one create on the club and one role_change per Manager, as admin", async () => {
    const [adminId, managerA, managerB] = await createUsers(3);

    const club = await repository.createWithManagers(adminId, {
      ...CLUB,
      managerIds: [managerA, managerB],
    });

    const rows = await prisma.auditLog.findMany({ where: { actorId: adminId } });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.actorRole === "admin")).toBe(true);
    expect(rows.filter((r) => r.action === "create")).toMatchObject([
      { resource: "organization", resourceId: club.id },
    ]);
    const roleChanges = rows.filter((r) => r.action === "role_change");
    expect(roleChanges.every((r) => r.resource === "membership")).toBe(true);
    expect(roleChanges.map((r) => r.subjectId).sort()).toEqual([managerA, managerB].sort());
  });

  it("if a Manager does not exist, no club and no audit rows are left", async () => {
    const [adminId, managerId] = await createUsers(2);
    const unknownUser = "33333333-3333-4333-8333-333333333333";
    const name = `${PREFIX}rollback`;

    await expect(
      repository.createWithManagers(adminId, {
        ...CLUB,
        name,
        managerIds: [managerId, unknownUser],
      }),
    ).rejects.toThrow();

    await expect(prisma.organization.count({ where: { name } })).resolves.toBe(0);
    await expect(prisma.auditLog.count({ where: { actorId: adminId } })).resolves.toBe(0);
  });
});

// assignManager and removeManager: the membership change and its audit row are
// committed or rolled back together
describe("PrismaOrganizationRepository.assignManager / removeManager", () => {
  const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";
  let clubCount = 0;

  // Built with prisma directly, so the setup writes no audit rows. The club has two
  // Managers and an athlete; the stranger exists but has no membership.
  async function setup() {
    const [adminId, managerId, otherManagerId, athleteId, strangerId] = await createUsers(5);
    const orgId = await createClub({
      name: `${PREFIX}audit-${clubCount++}`,
      description: null,
      timezone: "Europe/Madrid",
      members: 0,
    });
    await prisma.membership.createMany({
      data: [
        { orgId, userId: managerId, role: "manager" },
        { orgId, userId: otherManagerId, role: "manager" },
        { orgId, userId: athleteId, role: "athlete" },
      ],
    });
    return { adminId, managerId, otherManagerId, athleteId, strangerId, orgId };
  }

  async function roleOf(orgId: string, userId: string) {
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    return membership?.role ?? null;
  }

  const auditRows = (adminId: string) => prisma.auditLog.findMany({ where: { actorId: adminId } });

  // Makes the next audit write fail, but only after reading what the transaction
  // already changed: the mutation really ran in Postgres, then the audit failed
  function failNextAudit(orgId: string, userId: string) {
    const seen: { role: string | null } = { role: null };
    vi.mocked(recordAdminAction).mockImplementationOnce(async (tx: Prisma.TransactionClient) => {
      const membership = await tx.membership.findUnique({
        where: { userId_orgId: { userId, orgId } },
      });
      seen.role = membership?.role ?? null;
      throw new Error("audit write failed");
    });
    return seen;
  }

  it("assignManager on an athlete writes a role_change with actor, subject and club", async () => {
    const { adminId, athleteId, orgId } = await setup();

    await repository.assignManager(adminId, orgId, athleteId);

    expect(await roleOf(orgId, athleteId)).toBe("manager");
    const rows = await auditRows(adminId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: adminId,
      actorRole: "admin",
      action: "role_change",
      resource: "membership",
      subjectId: athleteId,
      resourceId: orgId,
    });
  });

  it("assignManager on a non-member makes them Manager and writes a role_change", async () => {
    const { adminId, strangerId, orgId } = await setup();

    await repository.assignManager(adminId, orgId, strangerId);

    expect(await roleOf(orgId, strangerId)).toBe("manager");
    expect(await auditRows(adminId)).toMatchObject([
      { action: "role_change", resource: "membership", subjectId: strangerId, resourceId: orgId },
    ]);
  });

  it("removeManager writes a role_change with actor, subject and club", async () => {
    const { adminId, managerId, orgId } = await setup();

    await repository.removeManager(adminId, orgId, managerId);

    expect(await roleOf(orgId, managerId)).toBe("athlete");
    const rows = await auditRows(adminId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: adminId,
      actorRole: "admin",
      action: "role_change",
      resource: "membership",
      subjectId: managerId,
      resourceId: orgId,
    });
  });

  // Each rejected case: [name, operation, error, who the target is, club, expected role after]
  const rejected = [
    ["assignManager si ya es Manager", "assignManager", AlreadyManagerError, "managerId", "orgId", "manager"],
    ["removeManager si es athlete", "removeManager", NotManagerError, "athleteId", "orgId", "athlete"],
    ["removeManager si no es miembro", "removeManager", NotManagerError, "strangerId", "orgId", null],
    ["assignManager si el usuario no existe", "assignManager", UserNotFoundError, "unknown", "orgId", null],
    ["removeManager si el club no existe", "removeManager", OrganizationNotFoundError, "managerId", "unknown", null],
  ] as const;

  for (const [name, operation, error, target, club, roleAfter] of rejected) {
    it(`${name} changes no membership and writes no audit`, async () => {
      const ids = await setup();
      const userId = target === "unknown" ? UNKNOWN_ID : ids[target];
      const orgId = club === "unknown" ? UNKNOWN_ID : ids.orgId;

      await expect(repository[operation](ids.adminId, orgId, userId)).rejects.toBeInstanceOf(error);

      if (club === "orgId" && target !== "unknown") {
        expect(await roleOf(orgId, userId)).toBe(roleAfter);
      }
      expect(await auditRows(ids.adminId)).toHaveLength(0);
    });
  }

  it("removeManager on the last Manager throws LastManagerError and writes no audit", async () => {
    const { adminId, managerId, otherManagerId, orgId } = await setup();
    await prisma.membership.delete({ where: { userId_orgId: { userId: otherManagerId, orgId } } });

    await expect(repository.removeManager(adminId, orgId, managerId)).rejects.toBeInstanceOf(
      LastManagerError,
    );

    expect(await roleOf(orgId, managerId)).toBe("manager");
    expect(await auditRows(adminId)).toHaveLength(0);
  });

  it("if the audit fails, assignManager rolls back the promotion of an athlete", async () => {
    const { adminId, athleteId, orgId } = await setup();
    const seen = failNextAudit(orgId, athleteId);

    await expect(repository.assignManager(adminId, orgId, athleteId)).rejects.toThrow(
      "audit write failed",
    );

    expect(seen.role).toBe("manager"); // the change existed inside the transaction
    expect(await roleOf(orgId, athleteId)).toBe("athlete"); // and is gone outside it
    expect(await auditRows(adminId)).toHaveLength(0);
  });

  it("if the audit fails, assignManager leaves no membership created", async () => {
    const { adminId, strangerId, orgId } = await setup();
    const seen = failNextAudit(orgId, strangerId);

    await expect(repository.assignManager(adminId, orgId, strangerId)).rejects.toThrow(
      "audit write failed",
    );

    expect(seen.role).toBe("manager");
    expect(await roleOf(orgId, strangerId)).toBeNull();
    expect(await auditRows(adminId)).toHaveLength(0);
  });

  it("if the audit fails, removeManager rolls back the demotion to athlete", async () => {
    const { adminId, managerId, orgId } = await setup();
    const seen = failNextAudit(orgId, managerId);

    await expect(repository.removeManager(adminId, orgId, managerId)).rejects.toThrow(
      "audit write failed",
    );

    expect(seen.role).toBe("athlete");
    expect(await roleOf(orgId, managerId)).toBe("manager");
    expect(await auditRows(adminId)).toHaveLength(0);
  });

  // Two operations at the same time, forced with a lock harness: G holds a lock, the
  // operations queue behind it, and only then is G released
  describe("at the same time", { timeout: 30_000 }, () => {
    // Cases with a real OTP check: deleteAccountWithOtp hashes the code before its transaction,
    // which under parallel test files can take seconds, and during that time the other
    // operation is already queued behind G. So these cases wait longer for the operations to
    // queue, and their clients allow a long wait for the lock: the Prisma default of 5 s would
    // expire the first operation's transaction while the second one is still being prepared.
    // The two waits of 8 s are upper bounds for the observation only: G's own 20 s
    // transaction timeout runs from the moment G opens, so it also covers the setup before the
    // waits. The margin is what is left of those 20 s; if G or an operation expires anyway, the
    // test fails (nothing retries or hides it).
    const OTP_OBSERVE_MS = 8_000;
    const OTP_CLIENT = { statementTimeoutMs: 20_000, transactionTimeoutMs: 20_000 };
    // Result of removeManager only: the deletion's result has another type and does not fit.
    // Anything but a domain error the case expects is not an outcome: it fails the test
    function removalOutcome(result: PromiseSettledResult<void>): "removed" | "LastManagerError" {
      if (result.status === "fulfilled") return "removed";
      if (result.reason instanceof LastManagerError) return "LastManagerError";
      throw result.reason;
    }

    it("two simultaneous removals of the two Managers: one is confirmed and the other throws LastManagerError", async () => {
      // Fixture: a club with exactly two Managers, A and B (and an athlete, who is not involved)
      const { adminId, managerId: a, otherManagerId: b, orgId } = await setup();

      const results = await withLockHarness(async (harness) => {
        // G holds the club row: each removal locks its own user, then waits for the club
        const gate = await harness.holdLock("gate", (tx) =>
          tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`,
        );
        const clientA = harness.client("remove-a");
        const clientB = harness.client("remove-b");
        const removeA = harness.track(
          new PrismaOrganizationRepository(clientA.db).removeManager(adminId, orgId, a),
        );
        const removeB = harness.track(
          new PrismaOrganizationRepository(clientB.db).removeManager(adminId, orgId, b),
        );

        // Both stopped at the club lock, behind G, before anything is released
        const evidence = await harness.waitUntilWaiting(gate, [
          { name: "remove A", client: clientA, queryFragment: "FROM organizations" },
          { name: "remove B", client: clientB, queryFragment: "FROM organizations" },
        ]);
        expect(new Set([gate.pid, ...evidence.map((e) => e.pid)]).size).toBe(3);

        gate.release();
        return Promise.allSettled([removeA, removeB]);
      });

      const outcomes = results.map(removalOutcome);
      expect([...outcomes].sort()).toEqual(["LastManagerError", "removed"]);
      const [winner, loser] = outcomes[0] === "removed" ? [a, b] : [b, a];
      // The Manager that was removed is still a member, as athlete; the other one stays
      expect(await roleOf(orgId, winner)).toBe("athlete");
      expect(await repository.listManagerIds(orgId)).toEqual([loser]);
      // Only the removal that was confirmed is audited: exactly one row
      const rows = await auditRows(adminId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "role_change",
        resource: "membership",
        subjectId: winner,
        resourceId: orgId,
      });
    });

    it("two simultaneous assignments of the same athlete: one is confirmed and the other throws AlreadyManagerError", async () => {
      // Fixture: a club with two Managers and an athlete, who both assignments target
      const { adminId, athleteId, orgId } = await setup();

      const results = await withLockHarness(async (harness) => {
        // G holds the athlete's user row: both assignments lock it first, then queue behind G
        const gate = await harness.holdLock("gate", (tx) =>
          tx.$queryRaw`SELECT id FROM users WHERE id = ${athleteId}::uuid FOR UPDATE`,
        );
        const clientA = harness.client("assign-a");
        const clientB = harness.client("assign-b");
        const assignA = harness.track(
          new PrismaOrganizationRepository(clientA.db).assignManager(adminId, orgId, athleteId),
        );
        const assignB = harness.track(
          new PrismaOrganizationRepository(clientB.db).assignManager(adminId, orgId, athleteId),
        );

        await harness.waitUntilWaiting(gate, [
          { name: "assign A", client: clientA, queryFragment: "FROM users" },
          { name: "assign B", client: clientB, queryFragment: "FROM users" },
        ]);

        gate.release();
        return Promise.allSettled([assignA, assignB]);
      });

      // Anything but AlreadyManagerError on the loser is not an outcome: it fails the test
      const outcomes = results.map((result) => {
        if (result.status === "fulfilled") return "assigned";
        if (result.reason instanceof AlreadyManagerError) return "AlreadyManagerError";
        throw result.reason;
      });
      expect([...outcomes].sort()).toEqual(["AlreadyManagerError", "assigned"]);
      expect(await roleOf(orgId, athleteId)).toBe("manager");
      // Only the confirmed assignment is audited
      const rows = await auditRows(adminId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: "role_change", subjectId: athleteId, resourceId: orgId });
    });

    // Assignment and removal of the same Manager meet at that user's row. The order they
    // queue in decides the outcome: assignment first finds a Manager already (AlreadyManagerError)
    // and the removal goes ahead; removal first leaves an athlete and the assignment promotes
    // them again, so both are confirmed and audited.
    async function assignAndRemoveSameManager(first: "assign" | "remove") {
      const { adminId, managerId, orgId } = await setup();

      const [assignResult, removeResult] = await withLockHarness(async (harness) => {
        const gate = await harness.holdLock("gate", (tx) =>
          tx.$queryRaw`SELECT id FROM users WHERE id = ${managerId}::uuid FOR UPDATE`,
        );
        const assignClient = harness.client("assign");
        const removeClient = harness.client("remove");
        const targets = {
          assign: { name: "assign", client: assignClient, queryFragment: "FROM users" },
          remove: { name: "remove", client: removeClient, queryFragment: "FROM users" },
        };
        const startAssign = () =>
          harness.track(new PrismaOrganizationRepository(assignClient.db).assignManager(adminId, orgId, managerId));
        const startRemove = () =>
          harness.track(new PrismaOrganizationRepository(removeClient.db).removeManager(adminId, orgId, managerId));
        let assignment!: ReturnType<typeof startAssign>;
        let removal!: ReturnType<typeof startRemove>;
        const start = {
          assign: () => void (assignment = startAssign()),
          remove: () => void (removal = startRemove()),
        };

        const second = first === "assign" ? "remove" : "assign";
        start[first]();
        await harness.waitUntilWaiting(gate, [targets[first]]);
        start[second]();
        await harness.waitUntilWaiting(gate, [targets.assign, targets.remove]);

        gate.release();
        return Promise.allSettled([assignment, removal]);
      });

      // The removal is confirmed in both orders: the club keeps its other Manager
      if (removeResult.status === "rejected") throw removeResult.reason;
      let assignOutcome: "assigned" | "AlreadyManagerError";
      if (assignResult.status === "fulfilled") assignOutcome = "assigned";
      else if (assignResult.reason instanceof AlreadyManagerError) assignOutcome = "AlreadyManagerError";
      else throw assignResult.reason;

      const rows = await auditRows(adminId);
      if (assignOutcome === "assigned") {
        // Removal, then assignment: the user ends as Manager and both changes are audited
        expect(await roleOf(orgId, managerId)).toBe("manager");
        expect(rows).toHaveLength(2);
      } else {
        // Assignment failed first, then the removal: the user ends as athlete, one audit row
        expect(await roleOf(orgId, managerId)).toBe("athlete");
        expect(rows).toHaveLength(1);
      }
      return assignOutcome;
    }

    it("assignment and removal of the same Manager: the assignment arrives first and throws AlreadyManagerError", async () => {
      await expect(assignAndRemoveSameManager("assign")).resolves.toBe("AlreadyManagerError");
    });

    it("assignment and removal of the same Manager: the removal arrives first and both are confirmed", async () => {
      await expect(assignAndRemoveSameManager("remove")).resolves.toBe("assigned");
    });

    // assignManager and the deletion of the recipient meet at the recipient's row in
    // users: G holds it, both queue on it. The club lock is not involved in the wait.
    function assignOutcome(result: PromiseSettledResult<void>): "assigned" | "UserNotFoundError" {
      if (result.status === "fulfilled") return "assigned";
      if (result.reason instanceof UserNotFoundError) return "UserNotFoundError";
      throw result.reason;
    }

    // Fixture: a club with two Managers (M, N) who are never deleted, an Admin who would
    // receive a club_without_manager notice, and a recipient R with no membership.
    // `first` is who reaches the recipient's lock first; the other one arrives after it
    // is proven to be waiting. Returns which of the two allowed outcomes happened.
    async function assignWhileRecipientIsDeleted(first: "assign" | "delete") {
      const { adminId, managerId, otherManagerId, strangerId: recipient, orgId } = await setup();
      await prisma.user.update({ where: { id: adminId }, data: { roleGlobal: "admin" } });
      // The code is issued before G exists, so nothing but the lock is left to wait for
      const code = await issueDeleteCode(prisma, recipient);

      try {
        const [assignResult, deleteResult] = await withLockHarness(async (harness) => {
          const gate = await harness.holdLock("gate", (tx) =>
            tx.$queryRaw`SELECT id FROM users WHERE id = ${recipient}::uuid FOR UPDATE`,
          );
          const assignClient = harness.client("assign", OTP_CLIENT);
          const deleteClient = harness.client("delete", OTP_CLIENT);
          const targets = {
            assign: { name: "assign", client: assignClient, queryFragment: "FROM users" },
            delete: { name: "delete", client: deleteClient, queryFragment: "FROM users" },
          };
          // One handle per operation, each keeping its own result type
          const startAssignment = () =>
            harness.track(
              new PrismaOrganizationRepository(assignClient.db).assignManager(adminId, orgId, recipient),
            );
          const startDeletion = () => harness.track(deleteAccountWithOtp(recipient, code, deleteClient.db));
          let assignment!: ReturnType<typeof startAssignment>;
          let deletion!: ReturnType<typeof startDeletion>;
          const start = {
            assign: () => void (assignment = startAssignment()),
            delete: () => void (deletion = startDeletion()),
          };

          const second = first === "assign" ? "delete" : "assign";
          start[first]();
          await harness.waitUntilWaiting(gate, [targets[first]], OTP_OBSERVE_MS);
          start[second]();
          await harness.waitUntilWaiting(gate, [targets.assign, targets.delete], OTP_OBSERVE_MS);

          gate.release();
          return Promise.allSettled([assignment, deletion]);
        });

        // The deletion must succeed in both orders; any other rejection is not an outcome
        if (deleteResult.status === "rejected") throw deleteResult.reason;
        const outcome = assignOutcome(assignResult);

        // Common to both outcomes
        expect(await prisma.user.findUnique({ where: { id: recipient } })).toBeNull();
        expect(await roleOf(orgId, recipient)).toBeNull();
        expect((await repository.listManagerIds(orgId)).sort()).toEqual([managerId, otherManagerId].sort());
        // Only this club's notices: other files delete Managers at the same time and every
        // Admin in the shared database receives their notices
        const clubNotices = (await prisma.notification.findMany({ where: { type: CLUB_WITHOUT_MANAGER } })).filter(
          (notice) => (notice.payload as { orgId?: string }).orgId === orgId,
        );
        expect(clubNotices).toHaveLength(0);
        expect(await prisma.auditLog.count({ where: { actorId: recipient, action: "account_deleted" } })).toBe(1);

        const rows = await auditRows(adminId);
        if (outcome === "assigned") {
          // The assignment committed first: its audit row stays although the recipient is gone
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            action: "role_change",
            resource: "membership",
            subjectId: recipient,
            resourceId: orgId,
          });
        } else {
          expect(rows).toHaveLength(0);
        }
        return outcome;
      } finally {
        // The recipient is gone, so the shared afterEach cannot find these rows through it
        await prisma.auditLog.deleteMany({ where: { actorId: recipient } });
      }
    }

    // Who gets the lock first is the order they queued in (Postgres grants a row lock
    // to waiters in arrival order), so each order is expected to give one outcome.
    it("the assignment arrives before the recipient's deletion: it is assigned and the recipient ends up deleted without membership", async () => {
      await expect(assignWhileRecipientIsDeleted("assign")).resolves.toBe("assigned");
    });

    it("the deletion arrives before the assignment: the assignment throws UserNotFoundError and leaves no audit", async () => {
      await expect(assignWhileRecipientIsDeleted("delete")).resolves.toBe("UserNotFoundError");
    });

    // The role removal (of one Manager) and the account deletion (of the other) touch
    // different users, so they meet at the club row: G holds it and both queue behind it.
    // Fixture: a club with exactly two Managers, `removed` (loses the role) and `deleted`
    // (deletes the account), and two real Admins, the expected recipients of any notice.
    // `first` is who reaches the club lock first. Returns which allowed outcome happened.
    async function removeManagerWhileOtherManagerDeletesAccount(first: "removal" | "deletion") {
      const { adminId, managerId: removed, otherManagerId: deleted, orgId } = await setup();
      const [secondAdminId] = await createUsers(1);
      const admins = [adminId, secondAdminId];
      await prisma.user.updateMany({ where: { id: { in: admins } }, data: { roleGlobal: "admin" } });
      const code = await issueDeleteCode(prisma, deleted);

      try {
        const [removalResult, deletionResult] = await withLockHarness(async (harness) => {
          const gate = await harness.holdLock("gate", (tx) =>
            tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`,
          );
          const removalClient = harness.client("removal", OTP_CLIENT);
          const deletionClient = harness.client("deletion", OTP_CLIENT);
          const targets = {
            removal: { name: "removal", client: removalClient, queryFragment: "FROM organizations" },
            deletion: { name: "deletion", client: deletionClient, queryFragment: "FROM organizations" },
          };
          // One handle per operation, each keeping its own result type
          const startRemoval = () =>
            harness.track(
              new PrismaOrganizationRepository(removalClient.db).removeManager(adminId, orgId, removed),
            );
          const startDeletion = () => harness.track(deleteAccountWithOtp(deleted, code, deletionClient.db));
          let removal!: ReturnType<typeof startRemoval>;
          let deletion!: ReturnType<typeof startDeletion>;
          const start = {
            removal: () => void (removal = startRemoval()),
            deletion: () => void (deletion = startDeletion()),
          };

          const second = first === "removal" ? "deletion" : "removal";
          start[first]();
          await harness.waitUntilWaiting(gate, [targets[first]], OTP_OBSERVE_MS);
          start[second]();
          await harness.waitUntilWaiting(gate, [targets.removal, targets.deletion], OTP_OBSERVE_MS);

          gate.release();
          return Promise.allSettled([removal, deletion]);
        });

        // The deletion succeeds in both orders; any other rejection is not an outcome
        if (deletionResult.status === "rejected") throw deletionResult.reason;
        const outcome = removalOutcome(removalResult);

        // Common to both outcomes
        expect(await prisma.user.findUnique({ where: { id: deleted } })).toBeNull();
        expect(await prisma.auditLog.count({ where: { actorId: deleted, action: "account_deleted" } })).toBe(1);

        // Notices about this club, by recipient (the shared database may hold other Admins
        // and other clubs' notices: only this club's are looked at)
        const clubNotices = (
          await prisma.notification.findMany({ where: { type: CLUB_WITHOUT_MANAGER } })
        ).filter((notice) => (notice.payload as { orgId?: string }).orgId === orgId);
        const ourNotices = clubNotices.filter((notice) => admins.includes(notice.userId));
        const rows = await auditRows(adminId);

        if (outcome === "removed") {
          // Removal first: `removed` is an athlete, the club ends without Manager, and
          // each of our Admins has exactly one notice about it
          expect(await roleOf(orgId, removed)).toBe("athlete");
          expect(await repository.listManagerIds(orgId)).toEqual([]);
          expect(ourNotices.map((notice) => notice.userId).sort()).toEqual([...admins].sort());
          expect(clubNotices.some((notice) => notice.userId === removed)).toBe(false);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            action: "role_change",
            resource: "membership",
            subjectId: removed,
            resourceId: orgId,
          });
        } else {
          // Deletion first: the other Manager stays, nobody was warned, the removal left no trace
          expect(await roleOf(orgId, removed)).toBe("manager");
          expect(await repository.listManagerIds(orgId)).toEqual([removed]);
          expect(clubNotices).toHaveLength(0);
          expect(rows).toHaveLength(0);
        }
        return outcome;
      } finally {
        // `deleted` is gone, so the shared afterEach cannot find its audit row through it
        await prisma.auditLog.deleteMany({ where: { actorId: deleted } });
      }
    }

    it("role removal of one Manager and account deletion of the other: the removal arrives first", async () => {
      await expect(removeManagerWhileOtherManagerDeletesAccount("removal")).resolves.toBe("removed");
    });

    it("role removal of one Manager and account deletion of the other: the deletion arrives first and the removal throws LastManagerError", async () => {
      await expect(removeManagerWhileOtherManagerDeletesAccount("deletion")).resolves.toBe("LastManagerError");
    });
  });
});
