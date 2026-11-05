// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { deleteWithFreshOtp, issueDeleteCode } from "../support/delete-account-helper";

// These tests delete rows, so they only run against a database whose name ends
// in _test (the db-test container). Without DATABASE_URL_TEST they are skipped.
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

const ADMIN_1 = "a0000000-0000-4000-8000-000000000001";
const ADMIN_2 = "a0000000-0000-4000-8000-000000000002";
const MANAGER_A = "a0000000-0000-4000-8000-000000000011";
const MANAGER_B = "a0000000-0000-4000-8000-000000000012";
const ORG_1 = "b0000000-0000-4000-8000-000000000001";
const ORG_2 = "b0000000-0000-4000-8000-000000000002";

const USER_IDS = [ADMIN_1, ADMIN_2, MANAGER_A, MANAGER_B];
const ORG_IDS = [ORG_1, ORG_2];

// Real password hashing on every OTP: with other test files running in parallel the 5 s default is too tight
describe.skipIf(!isTestDatabase)("deleteAccount: aviso al Admin por club sin Manager", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function createUser(id: string, roleGlobal: "admin" | "user") {
    await db.user.create({ data: { id, email: `${id}@example.test`, roleGlobal } });
  }

  async function createClub(id: string, managerIds: string[]) {
    await db.organization.create({ data: { id, name: `club-${id}`, timezone: "Europe/Madrid" } });
    await db.membership.createMany({
      data: managerIds.map((userId) => ({ userId, orgId: id, role: "manager" as const })),
    });
  }

  // Notices as [recipient, orgId] pairs, sorted so the assertions do not depend on insert order
  async function notices() {
    // Only this file's Admins: other test files share the database and create their own
    const rows = await db.notification.findMany({
      where: { type: "club_without_manager", userId: { in: [ADMIN_1, ADMIN_2] } },
    });
    return rows
      .map((row) => [row.userId, (row.payload as { orgId: string }).orgId])
      .sort((a, b) => a.join().localeCompare(b.join()));
  }

  beforeEach(async () => {
    await createUser(ADMIN_1, "admin");
    await createUser(MANAGER_A, "user");
    await createUser(MANAGER_B, "user");
  });

  // Deleting the users cascades to memberships and notifications
  afterEach(async () => {
    await db.user.deleteMany({ where: { id: { in: USER_IDS } } });
    await db.organization.deleteMany({ where: { id: { in: ORG_IDS } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("avisa al Admin cuando se borra al último Manager de un club", async () => {
    await createClub(ORG_1, [MANAGER_A]);

    await deleteWithFreshOtp(MANAGER_A, db);

    expect(await notices()).toEqual([[ADMIN_1, ORG_1]]);
  });

  it("no avisa si queda otro Manager en el club", async () => {
    await createClub(ORG_1, [MANAGER_A, MANAGER_B]);

    await deleteWithFreshOtp(MANAGER_A, db);

    expect(await notices()).toEqual([]);
  });

  it("con varios clubes avisa solo por los que quedan sin Manager", async () => {
    await createClub(ORG_1, [MANAGER_A]);
    await createClub(ORG_2, [MANAGER_A, MANAGER_B]);

    await deleteWithFreshOtp(MANAGER_A, db);

    expect(await notices()).toEqual([[ADMIN_1, ORG_1]]);
  });

  it("con varios Admins, cada uno recibe su propia notificación", async () => {
    await createUser(ADMIN_2, "admin");
    await createClub(ORG_1, [MANAGER_A]);
    await createClub(ORG_2, [MANAGER_A]);

    await deleteWithFreshOtp(MANAGER_A, db);

    expect(await notices()).toEqual([
      [ADMIN_1, ORG_1],
      [ADMIN_1, ORG_2],
      [ADMIN_2, ORG_1],
      [ADMIN_2, ORG_2],
    ]);
  });

  it("si el que se borra es Admin y último Manager, solo avisa a los otros Admins", async () => {
    await createUser(ADMIN_2, "admin");
    await db.user.update({ where: { id: MANAGER_A }, data: { roleGlobal: "admin" } });
    await createClub(ORG_1, [MANAGER_A]);

    await deleteWithFreshOtp(MANAGER_A, db);

    expect(await notices()).toEqual([
      [ADMIN_1, ORG_1],
      [ADMIN_2, ORG_1],
    ]);
  });

  it("si falla crear las notificaciones, el borrado también se revierte", async () => {
    await createClub(ORG_1, [MANAGER_A]);
    const injected = new Error("notification write failed");
    // Every notification write throws; the extended client still runs inside transactions
    const failing = db.$extends({
      query: {
        notification: {
          $allOperations() {
            throw injected;
          },
        },
      },
    }) as unknown as PrismaClient;

    // toBe: it must be the injected error itself, not another failure that happens to share text
    await expect(deleteWithFreshOtp(MANAGER_A, db, failing)).rejects.toBe(injected);

    expect(await db.user.findUnique({ where: { id: MANAGER_A } })).not.toBeNull();
    expect(await db.membership.count({ where: { userId: MANAGER_A } })).toBe(1);
    expect(await db.notification.count()).toBe(0);
  });

  // Without serialization both transactions see the other Manager and nobody warns the Admin.
  // The race is timing dependent, so it is repeated: it protects against regressions
  // more than it proves the lock is correct.
  it("dos Managers que se borran a la vez no dejan el club sin Manager y sin aviso", async () => {
    for (let round = 0; round < 10; round++) {
      await createClub(ORG_1, [MANAGER_A, MANAGER_B]);

      // Codes first, so the two deletions start together and only the transactions race
      const [codeA, codeB] = await Promise.all([issueDeleteCode(db, MANAGER_A), issueDeleteCode(db, MANAGER_B)]);
      await Promise.all([deleteAccountWithOtp(MANAGER_A, codeA, db), deleteAccountWithOtp(MANAGER_B, codeB, db)]);

      expect(await notices()).toEqual([[ADMIN_1, ORG_1]]);

      // Reset for the next round
      await db.notification.deleteMany({ where: { userId: ADMIN_1 } });
      await db.organization.deleteMany({ where: { id: ORG_1 } });
      await createUser(MANAGER_A, "user");
      await createUser(MANAGER_B, "user");
    }
  }, 60_000);
});
