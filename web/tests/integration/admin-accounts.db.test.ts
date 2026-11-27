// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  blockAccount,
  changeGlobalRole,
  deleteAccount,
  getAccount,
  listAccounts,
  unblockAccount,
  updateAccountNick,
} from "@/lib/admin/accounts";
import { getCurrentUser } from "@/lib/permissions/current-user";
import { PrismaCurrentUserRepository } from "@/lib/permissions/current-user-repository";

// getCurrentUser gets the session from the test: Auth.js itself is not needed
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// The list is newest first, and other test files create users in the same database
// while these tests run (with today's date). Created in 2099, these users are
// always the newest, so the first page holds only them and the checks do not
// depend on what the other files are doing
const IDS = {
  oldest: "a0000000-0000-4000-8000-000000000201",
  middle: "a0000000-0000-4000-8000-000000000202",
  newest: "a0000000-0000-4000-8000-000000000203",
};
const ADMIN_ID = "a0000000-0000-4000-8000-000000000220";
const CLUBS = {
  alpha: "a0000000-0000-4000-8000-000000000211",
  beta: "a0000000-0000-4000-8000-000000000212",
};

// One client for every describe below: disconnect it once, at the end of the file
afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser(
  id: string,
  createdAt: string,
  extra: { blockedAt?: Date; roleGlobal?: "user" | "admin" } = {},
) {
  await prisma.user.create({
    data: {
      id,
      email: `${id}@admin-accounts.test`,
      nick: `nick-${id.slice(-3)}`,
      passwordHash: "not-a-real-hash",
      createdAt: new Date(createdAt),
      ...extra,
    },
  });
}

describe("Integration: listAccounts", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@admin-accounts.test" } } });
  });
  it("lists accounts newest first, with only the fields the panel shows", async () => {
    const blockedAt = new Date("2099-01-05T00:00:00Z");
    await createUser(IDS.oldest, "2099-01-01T00:00:00Z");
    await createUser(IDS.newest, "2099-01-03T00:00:00Z", { blockedAt });
    await createUser(IDS.middle, "2099-01-02T00:00:00Z");

    const { accounts } = await listAccounts(prisma, { page: 1, pageSize: 3 });

    expect(accounts.map((account) => account.id)).toEqual([IDS.newest, IDS.middle, IDS.oldest]);
    expect(accounts[0]).toEqual({
      id: IDS.newest,
      email: `${IDS.newest}@admin-accounts.test`,
      nick: "nick-203",
      roleGlobal: "user",
      blockedAt,
      createdAt: new Date("2099-01-03T00:00:00Z"),
    });
    // Never the password hash or the second factor secret
    expect(Object.keys(accounts[0]).sort()).toEqual(
      ["blockedAt", "createdAt", "email", "id", "nick", "roleGlobal"],
    );
  });

  it("splits the list into pages and says whether there is another one", async () => {
    await createUser(IDS.oldest, "2099-01-01T00:00:00Z");
    await createUser(IDS.middle, "2099-01-02T00:00:00Z");
    await createUser(IDS.newest, "2099-01-03T00:00:00Z");

    const first = await listAccounts(prisma, { page: 1, pageSize: 2 });
    const second = await listAccounts(prisma, { page: 2, pageSize: 2 });

    expect(first.accounts.map((account) => account.id)).toEqual([IDS.newest, IDS.middle]);
    expect(first.hasNextPage).toBe(true);
    expect(second.accounts[0].id).toBe(IDS.oldest);
  });

  it("shows 50 accounts per page by default", async () => {
    // 51 accounts, all newer than any other test's: the first page is all ours
    await prisma.user.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        email: `default-page-${i}@admin-accounts.test`,
        createdAt: new Date(Date.UTC(2099, 1, 1, 0, i)),
      })),
    });

    const { accounts, hasNextPage } = await listAccounts(prisma, { page: 1 });

    expect(accounts).toHaveLength(50);
    expect(accounts.every((account) => account.email.endsWith("@admin-accounts.test"))).toBe(true);
    expect(hasNextPage).toBe(true);
  });
});

describe("Integration: listAccounts at the highest page", () => {
  // queries.ts lets ?page= go up to 999999: the database answers an empty page, not an error
  it("gives an empty page for page 999999", async () => {
    await expect(listAccounts(prisma, { page: 999999 })).resolves.toEqual({ accounts: [], hasNextPage: false });
  });
});

describe("Integration: getAccount", () => {
  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: Object.values(CLUBS) } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@admin-accounts.test" } } });
  });
  it("gives the account's fields and its clubs with its role in each, by club name", async () => {
    await createUser(IDS.middle, "2099-01-02T00:00:00Z");
    await prisma.organization.createMany({
      data: [
        { id: CLUBS.beta, name: "Beta Running", timezone: "Europe/Madrid" },
        { id: CLUBS.alpha, name: "Alpha Track", timezone: "Europe/Madrid" },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { userId: IDS.middle, orgId: CLUBS.beta, role: "athlete" },
        { userId: IDS.middle, orgId: CLUBS.alpha, role: "manager" },
      ],
    });

    const account = await getAccount(prisma, IDS.middle);

    expect(account).toEqual({
      id: IDS.middle,
      email: `${IDS.middle}@admin-accounts.test`,
      nick: "nick-202",
      roleGlobal: "user",
      blockedAt: null,
      createdAt: new Date("2099-01-02T00:00:00Z"),
      clubs: [
        { id: CLUBS.alpha, name: "Alpha Track", role: "manager" },
        { id: CLUBS.beta, name: "Beta Running", role: "athlete" },
      ],
    });
  });

  it("gives an account without clubs an empty list", async () => {
    await createUser(IDS.oldest, "2099-01-01T00:00:00Z");

    const account = await getAccount(prisma, IDS.oldest);

    expect(account?.clubs).toEqual([]);
  });

  it("gives null when the account does not exist", async () => {
    await expect(getAccount(prisma, IDS.newest)).resolves.toBeNull();
  });

  it("gives null for an id that is not a UUID, instead of a database error", async () => {
    // The id comes from the address (/admin/accounts/<id>): anyone can type anything
    await expect(getAccount(prisma, "hola")).resolves.toBeNull();
  });
});

describe("Integration: blockAccount and unblockAccount", () => {
  const target = IDS.middle;
  const auditRows = () => prisma.auditLog.findMany({ where: { actorId: ADMIN_ID } });
  const blockedAtOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { blockedAt: true } })).blockedAt;

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@admin-accounts.test" } } });
  });
  it("blocks the account and writes one block row in audit_log", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await blockedAtOf(target)).toBeInstanceOf(Date);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorRole: "admin",
      action: "block",
      resource: "account",
      subjectId: target,
    });
  });

  describe("club_without_manager notice", () => {
    const CLUB = CLUBS.alpha;
    const otherManager = IDS.newest;

    async function createClub(managerIds: string[]) {
      await prisma.organization.create({ data: { id: CLUB, name: "block-notice-club", timezone: "Europe/Madrid" } });
      await prisma.membership.createMany({ data: managerIds.map((userId) => ({ userId, orgId: CLUB, role: "manager" as const })) });
    }
    // Only this test's Admin and club: other files share the database and its Admins
    async function noticesToAdmin() {
      const rows = await prisma.notification.findMany({ where: { type: "club_without_manager", userId: ADMIN_ID } });
      return rows.filter((row) => (row.payload as { orgId: string }).orgId === CLUB);
    }

    afterEach(async () => {
      await prisma.organization.deleteMany({ where: { id: CLUB } });
    });

    it("warns the Admins when the blocked account was the last active Manager", async () => {
      await createUser(ADMIN_ID, "2099-01-01T00:00:00Z", { roleGlobal: "admin" });
      await createUser(target, "2099-01-02T00:00:00Z");
      await createClub([target]);

      await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

      expect(await noticesToAdmin()).toHaveLength(1);
      expect(await prisma.membership.count({ where: { orgId: CLUB, userId: target } })).toBe(1);
    });

    it("warns when the only other Manager was already blocked", async () => {
      await createUser(ADMIN_ID, "2099-01-01T00:00:00Z", { roleGlobal: "admin" });
      await createUser(target, "2099-01-02T00:00:00Z");
      await createUser(otherManager, "2099-01-03T00:00:00Z", { blockedAt: new Date() });
      await createClub([target, otherManager]);

      await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

      expect(await noticesToAdmin()).toHaveLength(1);
    });

    it("does not warn when another active Manager stays", async () => {
      await createUser(ADMIN_ID, "2099-01-01T00:00:00Z", { roleGlobal: "admin" });
      await createUser(target, "2099-01-02T00:00:00Z");
      await createUser(otherManager, "2099-01-03T00:00:00Z");
      await createClub([target, otherManager]);

      await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

      expect(await noticesToAdmin()).toEqual([]);
    });

    it("does not warn again when the account was already blocked", async () => {
      await createUser(ADMIN_ID, "2099-01-01T00:00:00Z", { roleGlobal: "admin" });
      await createUser(target, "2099-01-02T00:00:00Z", { blockedAt: new Date() });
      await createClub([target]);

      await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

      expect(await noticesToAdmin()).toEqual([]);
    });
  });

  it("does not let the Admin block their own account", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z");

    const result = await blockAccount(prisma, { adminId: ADMIN_ID, accountId: ADMIN_ID });

    expect(result).toEqual({ ok: false, reason: "self" });
    expect(await blockedAtOf(ADMIN_ID)).toBeNull();
    await expect(auditRows()).resolves.toEqual([]);
  });

  // A form sent by hand can carry the id in any case: Postgres compares uuids by
  // value, so "A0…" is the same account as "a0…"
  it("does not let the Admin block their own account with the id in upper or mixed case", async () => {
    // Letters in several groups, so upper case and mixed case are really different texts
    const selfId = "abcdef00-0000-4000-8000-0000000002cd";
    await createUser(selfId, "2099-01-04T00:00:00Z");

    for (const accountId of ["ABCDEF00-0000-4000-8000-0000000002CD", "AbCdEf00-0000-4000-8000-0000000002Cd"]) {
      await expect(blockAccount(prisma, { adminId: selfId, accountId })).resolves.toEqual({
        ok: false,
        reason: "self",
      });
    }
    expect(await blockedAtOf(selfId)).toBeNull();
    await expect(prisma.auditLog.findMany({ where: { actorId: selfId } })).resolves.toEqual([]);
  });

  it("blocks another account sent with the id in upper case, and audit_log keeps it in lowercase", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target.toUpperCase() });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await blockedAtOf(target)).toBeInstanceOf(Date);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectId).toBe(target);
  });

  // Last-Admin rule (#102, lockAccountAndAdmins from #158): another unblocked Admin
  // (the one acting) is left, so blocking an Admin goes through like any account
  it("blocks another Admin account while another unblocked Admin is left", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    const result = await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await blockedAtOf(target)).toBeInstanceOf(Date);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "block", subjectId: target });
  });

  // Two Admins blocking each other at once: the second one runs after the first commit,
  // so the Admin acting is already blocked and the target is the last unblocked Admin.
  // The race itself is tested in lockAccountAndAdmins (#191); here, the rule it feeds
  it("does not block the last unblocked Admin, also with the id in upper case, and writes no row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin", blockedAt: new Date("2099-01-05T00:00:00Z") });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    for (const accountId of [target, target.toUpperCase()]) {
      await expect(blockAccount(prisma, { adminId: ADMIN_ID, accountId })).resolves.toEqual({
        ok: false,
        reason: "last-admin",
      });
    }
    expect(await blockedAtOf(target)).toBeNull();
    await expect(auditRows()).resolves.toEqual([]);
  });

  // It is already as the Admin wanted: say so, like for any other account, not "cannot"
  it("blocking an Admin account that is already blocked says it was already blocked", async () => {
    const blockedAt = new Date("2099-01-05T00:00:00Z");
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin", blockedAt });

    await expect(blockAccount(prisma, { adminId: ADMIN_ID, accountId: target })).resolves.toEqual({
      ok: true,
      changed: false,
    });
    expect(await blockedAtOf(target)).toEqual(blockedAt);
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("still unblocks an Admin account that was blocked before this rule", async () => {
    await createUser(target, "2099-01-02T00:00:00Z", {
      roleGlobal: "admin",
      blockedAt: new Date("2099-01-05T00:00:00Z"),
    });

    await expect(unblockAccount(prisma, { adminId: ADMIN_ID, accountId: target })).resolves.toEqual({
      ok: true,
      changed: true,
    });
    expect(await blockedAtOf(target)).toBeNull();
  });

  it("changes nothing and writes no row when the account is already blocked", async () => {
    const blockedAt = new Date("2099-01-05T00:00:00Z");
    await createUser(target, "2099-01-02T00:00:00Z", { blockedAt });

    const result = await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: true, changed: false });
    // The first block date stays: it says since when the account is blocked
    expect(await blockedAtOf(target)).toEqual(blockedAt);
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("unblocks the account and writes one unblock row in audit_log", async () => {
    await createUser(target, "2099-01-02T00:00:00Z", { blockedAt: new Date("2099-01-05T00:00:00Z") });

    const result = await unblockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await blockedAtOf(target)).toBeNull();
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "unblock", resource: "account", subjectId: target });
  });

  it("changes nothing and writes no row when the account is not blocked", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await unblockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: true, changed: false });
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("the blocked person's next request no longer gets in", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");
    // The person still has a valid session (JWT) for their account
    const session = async () => ({ user: { id: target }, expires: "2099-12-31T00:00:00Z" });
    const repo = new PrismaCurrentUserRepository(prisma);
    expect((await getCurrentUser(session, repo)).ok).toBe(true);

    await blockAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    await expect(getCurrentUser(session, repo)).resolves.toEqual({ ok: false, reason: "blocked" });
  });

  it("says not-found for an account that does not exist or a malformed id", async () => {
    await expect(blockAccount(prisma, { adminId: ADMIN_ID, accountId: IDS.newest })).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(unblockAccount(prisma, { adminId: ADMIN_ID, accountId: "hola" })).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(auditRows()).resolves.toEqual([]);
  });
});

describe("Integration: updateAccountNick", () => {
  const target = IDS.middle;
  const auditRows = () => prisma.auditLog.findMany({ where: { actorId: ADMIN_ID } });
  const nickOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { nick: true } })).nick;

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@admin-accounts.test" } } });
  });
  it("changes the nick of an account sent with the id in upper case, and audit_log keeps it in lowercase", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: target.toUpperCase(), nick: "Nuevo" });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await nickOf(target)).toBe("Nuevo");
    expect((await auditRows())[0].subjectId).toBe(target);
  });

  it("saves the new nick without spaces around it and writes one update row", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: target, nick: "  Corredora  " });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await nickOf(target)).toBe("Corredora");
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    // Ids only: the nick itself never goes to audit_log
    expect(rows[0]).toMatchObject({ action: "update", resource: "account", subjectId: target, resourceId: null });
  });

  it("rejects a nick that breaks the sign-up rule, with its message, and changes nothing", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: target, nick: " a " });

    expect(result).toEqual({
      ok: false,
      reason: "invalid-nick",
      message: "El nick debe tener al menos 2 caracteres",
    });
    expect(await nickOf(target)).toBe("nick-202");
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("gives a nick to an account that has none yet (signed up with OAuth)", async () => {
    await prisma.user.create({
      data: { id: target, email: `${target}@admin-accounts.test`, createdAt: new Date("2099-01-02T00:00:00Z") },
    });

    const result = await updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: target, nick: "Corredora" });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await nickOf(target)).toBe("Corredora");
    await expect(auditRows()).resolves.toHaveLength(1);
  });

  it("changes nothing and writes no row when the nick is the same", async () => {
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: target, nick: "nick-202" });

    expect(result).toEqual({ ok: true, changed: false });
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("says not-found for an account that does not exist or a malformed id", async () => {
    await expect(
      updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: IDS.newest, nick: "Nuevo" }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(
      updateAccountNick(prisma, { adminId: ADMIN_ID, accountId: "hola", nick: "Nuevo" }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(auditRows()).resolves.toEqual([]);
  });
});

describe("Integration: deleteAccount", () => {
  const target = IDS.middle;
  const auditRows = () => prisma.auditLog.findMany({ where: { actorId: ADMIN_ID } });
  const exists = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { id: true } })) !== null;

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@admin-accounts.test" } } });
  });

  // The same deletion as the person's own (deleteAccountAsAdmin, #158): here, the panel's rules
  it("deletes the account and writes one delete row in audit_log", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await deleteAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await exists(target)).toBe(false);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorRole: "admin", action: "delete", resource: "account", subjectId: target });
  });

  // Deleting yourself would lock you out of the panel, and the panel is not where you
  // delete your own account (that is /settings, with the email code)
  it("does not let the Admin delete their own account, also with the id in upper or mixed case", async () => {
    const selfId = "abcdef00-0000-4000-8000-0000000002cd";
    await createUser(selfId, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(ADMIN_ID, "2099-01-03T00:00:00Z", { roleGlobal: "admin" });

    for (const accountId of [selfId, "ABCDEF00-0000-4000-8000-0000000002CD", "AbCdEf00-0000-4000-8000-0000000002Cd"]) {
      await expect(deleteAccount(prisma, { adminId: selfId, accountId })).resolves.toEqual({ ok: false, reason: "self" });
    }
    expect(await exists(selfId)).toBe(true);
    await expect(prisma.auditLog.findMany({ where: { actorId: selfId } })).resolves.toEqual([]);
  });

  // The id comes from a form anyone can send by hand: a malformed one would make Postgres
  // throw 22P02 (a 500) instead of saying the account does not exist
  it("says not-found for an account that does not exist or a malformed id, and writes no row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });

    for (const accountId of [target, "hola", ""]) {
      await expect(deleteAccount(prisma, { adminId: ADMIN_ID, accountId })).resolves.toEqual({
        ok: false,
        reason: "not-found",
      });
    }
    await expect(auditRows()).resolves.toEqual([]);
  });

  // The Admin acting is another unblocked Admin, so one is left (lockAccountAndAdmins, #158)
  it("deletes another Admin account sent with the id in upper case, and audit_log keeps it in lowercase", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    const result = await deleteAccount(prisma, { adminId: ADMIN_ID, accountId: target.toUpperCase() });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await exists(target)).toBe(false);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectId).toBe(target);
  });

  // Two Admins deleting each other at once: the second one runs after the first commit,
  // so the Admin acting is gone or blocked and the target is the last unblocked Admin
  it("does not delete the last unblocked Admin, and writes no row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin", blockedAt: new Date("2099-01-05T00:00:00Z") });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    const result = await deleteAccount(prisma, { adminId: ADMIN_ID, accountId: target });

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(await exists(target)).toBe(true);
    await expect(auditRows()).resolves.toEqual([]);
  });
});

describe("Integration: changeGlobalRole", () => {
  const target = IDS.middle;
  const auditRows = () => prisma.auditLog.findMany({ where: { actorId: ADMIN_ID } });
  const roleOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { roleGlobal: true } })).roleGlobal;

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@admin-accounts.test" } } });
    await prisma.organization.deleteMany({ where: { id: { in: Object.values(CLUBS) } } });
  });

  it("makes a normal account an Admin and writes one role_change row in audit_log", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "admin" });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await roleOf(target)).toBe("admin");
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorRole: "admin", action: "role_change", resource: "account", subjectId: target });
  });

  it("removes the Admin role while another unblocked Admin is left, and writes one row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "user" });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await roleOf(target)).toBe("user");
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "role_change", subjectId: target });
  });

  it("changes nothing and writes no row when the account already has that role", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z");

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "user" });

    expect(result).toEqual({ ok: true, changed: false });
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("says not-found for an account that does not exist or a malformed id, and writes no row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });

    for (const accountId of [IDS.newest, "not-a-uuid"]) {
      await expect(changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId, role: "admin" })).resolves.toEqual({
        ok: false,
        reason: "not-found",
      });
    }
    await expect(auditRows()).resolves.toEqual([]);
  });

  it("does not let the Admin remove their own Admin role, also with the id in upper or mixed case", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });
    const mixed = ADMIN_ID.slice(0, 18) + ADMIN_ID.slice(18).toUpperCase();

    for (const accountId of [ADMIN_ID, ADMIN_ID.toUpperCase(), mixed]) {
      await expect(changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId, role: "user" })).resolves.toEqual({
        ok: false,
        reason: "self",
      });
    }
    expect(await roleOf(ADMIN_ID)).toBe("admin");
    await expect(auditRows()).resolves.toEqual([]);
  });

  // Two Admins removing each other's role at once: the second one runs after the first
  // commit, so the Admin acting is no Admin any more and the target is the last one.
  // Here the Admin acting is blocked, which leaves the target last in the same way
  it("does not remove the Admin role from the last unblocked Admin, and writes no row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin", blockedAt: new Date("2099-01-05T00:00:00Z") });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "user" });

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(await roleOf(target)).toBe("admin");
    await expect(auditRows()).resolves.toEqual([]);
  });

  // Decision B of #214: an Admin is never a Manager, the other way round from assignManager
  it("does not make a Manager of a club an Admin, and writes no row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z");
    await prisma.organization.create({ data: { id: CLUBS.alpha, name: "Alpha 103", timezone: "Europe/Madrid" } });
    await prisma.membership.create({ data: { userId: target, orgId: CLUBS.alpha, role: "manager" } });

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "admin" });

    expect(result).toEqual({ ok: false, reason: "club-manager" });
    expect(await roleOf(target)).toBe("user");
    await expect(auditRows()).resolves.toEqual([]);
  });

  // A blocked Admin does not count as an unblocked one, so removing its role leaves the
  // number of unblocked Admins unchanged, even when the Admin acting is the only one
  it("removes the Admin role from a blocked Admin, and writes one row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin", blockedAt: new Date("2099-01-05T00:00:00Z") });

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "user" });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await roleOf(target)).toBe("user");
    await expect(auditRows()).resolves.toHaveLength(1);
  });

  // A page drawn before another Admin made the target an Admin, sent by an Admin who no
  // longer counts (blocked meanwhile): it is already as wanted, never a last-Admin refusal
  it("making an Admin of an account that already is one says so, even when it is the last unblocked Admin", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin", blockedAt: new Date("2099-01-05T00:00:00Z") });
    await createUser(target, "2099-01-02T00:00:00Z", { roleGlobal: "admin" });

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "admin" });

    expect(result).toEqual({ ok: true, changed: false });
    await expect(auditRows()).resolves.toEqual([]);
  });

  // Only a Manager is refused: an Athlete of a club can be an Admin (CONTEXT.md, Admin)
  it("makes an Athlete of a club an Admin, and writes one row", async () => {
    await createUser(ADMIN_ID, "2099-01-04T00:00:00Z", { roleGlobal: "admin" });
    await createUser(target, "2099-01-02T00:00:00Z");
    await prisma.organization.create({ data: { id: CLUBS.alpha, name: "Alpha 103", timezone: "Europe/Madrid" } });
    await prisma.membership.create({ data: { userId: target, orgId: CLUBS.alpha, role: "athlete" } });

    const result = await changeGlobalRole(prisma, { adminId: ADMIN_ID, accountId: target, role: "admin" });

    expect(result).toEqual({ ok: true, changed: true });
    expect(await roleOf(target)).toBe("admin");
    await expect(auditRows()).resolves.toHaveLength(1);
  });
});
