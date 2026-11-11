// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { deleteAccountAsAdmin } from "@/lib/gdpr/delete-account";
import { deleteWithFreshOtp } from "../support/delete-account-helper";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const ADMIN_1 = "a1000000-0000-4000-8000-000000000001";
const ADMIN_2 = "a1000000-0000-4000-8000-000000000002";
const USER_1 = "a1000000-0000-4000-8000-000000000011";
const ORG_1 = "b1000000-0000-4000-8000-000000000001";
const MISSING = "a1000000-0000-4000-8000-0000000000ff";
const USER_IDS = [ADMIN_1, ADMIN_2, USER_1];

// Real password hashing on every OTP: with other test files running in parallel the 5 s default is too tight
describe("deleteAccountAsAdmin y la regla del último Admin", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function createUser(id: string, roleGlobal: "admin" | "user", blocked = false) {
    await db.user.create({
      data: { id, email: `${id}@example.test`, roleGlobal, blockedAt: blocked ? new Date() : null },
    });
  }

  // Other test files share this database and create their own Admins while these tests run, so
  // "the only Admin" would not hold. This client unblocks nothing and blocks every Admin outside
  // `keepIds` inside the transaction under test, and puts them back before the commit, so the
  // rule sees just this file's Admins and no other file ever sees the change.
  function onlyTheseAdmins(keepIds: string[]): PrismaClient {
    return new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return (fn: (tx: PrismaClient) => Promise<unknown>, options?: object) =>
          target.$transaction(async (tx) => {
            // Same order as lockAccountAndAdmins (ADR 0004): without it, an updateMany in any order plus
            // another file's deletion locking by id can deadlock (40P01)
            await tx.$queryRaw`SELECT id FROM users WHERE role_global = 'admin' ORDER BY id FOR UPDATE`;
            const others = await tx.user.findMany({
              where: { roleGlobal: "admin", blockedAt: null, id: { notIn: keepIds } },
              select: { id: true },
            });
            const ids = others.map((row) => row.id);
            await tx.user.updateMany({ where: { id: { in: ids } }, data: { blockedAt: new Date() } });
            const result = await fn(tx as unknown as PrismaClient);
            await tx.user.updateMany({ where: { id: { in: ids } }, data: { blockedAt: null } });
            return result;
          }, options);
      },
    }) as PrismaClient;
  }

  // The caller's audit row (#104 writes the real one); here it only shows that the callback runs in the transaction
  const writeAudit = (actorId: string, subjectId: string) => (tx: Prisma.TransactionClient) =>
    tx.auditLog.create({ data: { actorId, subjectId, actorRole: "admin", action: "account_deleted", resource: "account" } }).then(() => {});

  beforeEach(async () => {
    await createUser(ADMIN_1, "admin");
    await createUser(USER_1, "user");
  });

  afterEach(async () => {
    // account_deleted rows have no FK to User, so deleting the users does not remove them
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: USER_IDS } }, { subjectId: { in: USER_IDS } }] } });
    await db.user.deleteMany({ where: { id: { in: USER_IDS } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("el Admin borra la cuenta de otra persona sin OTP y su callback corre en la misma transacción", async () => {
    const result = await deleteAccountAsAdmin(USER_1, writeAudit(ADMIN_1, USER_1), db);

    expect(result).toEqual({ deleted: true });
    expect(await db.user.findUnique({ where: { id: USER_1 } })).toBeNull();
    expect(await db.auditLog.count({ where: { actorId: ADMIN_1, subjectId: USER_1 } })).toBe(1);
  });

  // Same effects as the OTP path (docs/gdpr/account-deletion-table.md): row, cascade, avatar files and Admin notice
  it("borra lo mismo que el borrado con OTP: cascada, archivos de avatar y aviso por club sin Manager", async () => {
    const uploadsDir = await mkdtemp(path.join(tmpdir(), "delete-account-admin-uploads-"));
    try {
      await db.organization.create({ data: { id: ORG_1, name: "club-admin-test", timezone: "Europe/Madrid" } });
      await db.membership.create({ data: { userId: USER_1, orgId: ORG_1, role: "manager" } });
      await db.avatar.create({ data: { ownerId: USER_1, mimeType: "image/png", sizeBytes: 1, path: "avatars/admin-test.png" } });
      await mkdir(path.join(uploadsDir, "avatars"), { recursive: true });
      await writeFile(path.join(uploadsDir, "avatars", "admin-test.png"), "x");

      expect(await deleteAccountAsAdmin(USER_1, writeAudit(ADMIN_1, USER_1), db, uploadsDir)).toEqual({ deleted: true });

      expect(await db.user.findUnique({ where: { id: USER_1 } })).toBeNull();
      expect(await db.membership.count({ where: { userId: USER_1 } })).toBe(0);
      expect(await db.avatar.count({ where: { ownerId: USER_1 } })).toBe(0);
      expect(existsSync(path.join(uploadsDir, "avatars", "admin-test.png"))).toBe(false);
      const notices = await db.notification.findMany({ where: { userId: ADMIN_1, type: "club_without_manager" } });
      expect(notices.map((row) => (row.payload as { orgId: string }).orgId)).toEqual([ORG_1]);
    } finally {
      await db.organization.deleteMany({ where: { id: ORG_1 } });
      await rm(uploadsDir, { recursive: true, force: true });
    }
  });

  it("una cuenta que no existe devuelve not_found y revierte el callback", async () => {
    const result = await deleteAccountAsAdmin(MISSING, writeAudit(ADMIN_1, MISSING), db);

    expect(result).toEqual({ deleted: false, reason: "not_found" });
    expect(await db.auditLog.count({ where: { subjectId: MISSING } })).toBe(0);
  });

  it("el último Admin sin bloquear no se puede borrar por otro Admin", async () => {
    // ADMIN_2 is blocked: it does not count as an Admin that stays
    await createUser(ADMIN_2, "admin", true);

    const result = await deleteAccountAsAdmin(ADMIN_1, writeAudit(ADMIN_2, ADMIN_1), onlyTheseAdmins([ADMIN_1, ADMIN_2]));

    expect(result).toEqual({ deleted: false, reason: "last_admin" });
    expect(await db.user.findUnique({ where: { id: ADMIN_1 } })).not.toBeNull();
    expect(await db.auditLog.count({ where: { subjectId: ADMIN_1 } })).toBe(0);
  });

  it("el último Admin sin bloquear no se puede borrar a sí mismo con OTP, y el código no se gasta", async () => {
    const guarded = onlyTheseAdmins([ADMIN_1]);

    const result = await deleteWithFreshOtp(ADMIN_1, db, guarded);

    expect(result).toEqual({ deleted: false, reason: "last_admin" });
    expect(await db.user.findUnique({ where: { id: ADMIN_1 } })).not.toBeNull();
    expect(await db.emailOtpCode.count({ where: { userId: ADMIN_1, consumedAt: { not: null } } })).toBe(0);
  });

  it("un Admin se puede borrar si queda otro sin bloquear", async () => {
    await createUser(ADMIN_2, "admin");

    const result = await deleteAccountAsAdmin(ADMIN_1, writeAudit(ADMIN_2, ADMIN_1), db);

    expect(result).toEqual({ deleted: true });
    expect(await db.user.findUnique({ where: { id: ADMIN_1 } })).toBeNull();
  });

  // Waits until some connection is blocked by the lock holderPid holds. Filtered by holder, not
  // "anyone waiting": other test files share this database.
  async function waitUntilBlockedBy(holderPid: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))
        ) AS blocked`;
      if (row.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No connection was blocked by ${holderPid} within 5 s`);
  }

  // Deterministic, no timing luck: the test holds ADMIN_1's lock in a raw transaction, the deletion
  // of ADMIN_2 starts and waits, and then the test asks for ADMIN_2's lock. The deletion takes the
  // rows in id order in ONE statement, so it holds nothing of ADMIN_2 while it waits and the test
  // gets it. If it locked its own row (ADMIN_2) first, the test would wait for it while it waits
  // for ADMIN_1: a deadlock (40P01), and the test fails.
  it("el borrado de un Admin espera por la fila menor sin retener la propia, así que no hay deadlock", async () => {
    await createUser(ADMIN_2, "admin");
    let deletion!: Promise<unknown>;

    await db.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ADMIN_1}::uuid FOR UPDATE`;

      deletion = deleteAccountAsAdmin(ADMIN_2, writeAudit(ADMIN_1, ADMIN_2), onlyTheseAdmins([ADMIN_1, ADMIN_2]));
      await waitUntilBlockedBy(pid);

      // Would raise 40P01 (and fail the test) if the deletion already held ADMIN_2
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ADMIN_2}::uuid FOR UPDATE`;
    });

    // The test committed: ADMIN_1 stays unblocked, so ADMIN_2 may go
    expect(await deletion).toEqual({ deleted: true });
    expect(await db.user.findUnique({ where: { id: ADMIN_2 } })).toBeNull();
  });

  // Two Admins deleting each other at the same time: only one may go. The ordering is proven by the
  // test above; this one covers the rule after the lock (without it both would pass and nobody is
  // left) and depends on timing, so it is a smoke test, not the proof.
  it("dos Admins que se borran a la vez no dejan el sistema sin Admin", async () => {
    await createUser(ADMIN_2, "admin");
    const guarded = onlyTheseAdmins([ADMIN_1, ADMIN_2]);

    // allSettled: a failure shows up as a rejected result and no transaction is still running at the end
    const settled = await Promise.allSettled([
      deleteAccountAsAdmin(ADMIN_2, writeAudit(ADMIN_1, ADMIN_2), guarded),
      deleteAccountAsAdmin(ADMIN_1, writeAudit(ADMIN_2, ADMIN_1), guarded),
    ]);
    expect(settled.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const results = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

    expect(results.filter((result) => result.deleted)).toHaveLength(1);
    expect(results.filter((result) => !result.deleted && result.reason === "last_admin")).toHaveLength(1);
    expect(await db.user.count({ where: { id: { in: [ADMIN_1, ADMIN_2] } } })).toBe(1);
  });
});
