// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { deleteWithFreshOtp } from "../support/delete-account-helper";

// These tests delete rows, so they only run against a database whose name ends in _test
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

const LEAVING_ID = "88888888-8888-4888-8888-888888888881";
const ADMIN_ID = "88888888-8888-4888-8888-888888888882";

// The account_deleted audit row (docs/gdpr/account-deletion-table.md, Privacy Policy section 7)
describe.skipIf(!isTestDatabase)("borrado de cuenta: auditoría", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const auditRows = () => db.auditLog.findMany({ where: { actorId: LEAVING_ID, action: "account_deleted" } });

  beforeEach(async () => {
    await db.user.create({ data: { id: LEAVING_ID, email: "audit-leaving@example.test" } });
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: { in: [LEAVING_ID, ADMIN_ID] } } });
    await db.user.deleteMany({ where: { id: { in: [LEAVING_ID, ADMIN_ID] } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("deja una fila account_deleted solo con ids, y sigue ahí tras borrar la cuenta", async () => {
    expect(await deleteWithFreshOtp(LEAVING_ID, db)).toEqual({ deleted: true });

    expect(await db.user.findUnique({ where: { id: LEAVING_ID } })).toBeNull();
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: LEAVING_ID,
      subjectId: LEAVING_ID,
      actorRole: null,
      resource: "account",
      resourceId: null,
    });
  });

  it("no deja fila si se rechaza el código", async () => {
    expect(await deleteAccountWithOtp(LEAVING_ID, "000000", db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await db.user.findUnique({ where: { id: LEAVING_ID } })).not.toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  it("no deja fila si la transacción se revierte", async () => {
    // Same failure as the rollback test in delete-account.test.ts: a Manager of a club with an Admin
    // to notify, every notification write throwing. The audit row is written before that point
    await db.user.create({ data: { id: ADMIN_ID, email: "audit-admin@example.test", roleGlobal: "admin" } });
    const org = await db.organization.create({ data: { name: "audit-rollback-club", timezone: "Europe/Madrid" } });
    await db.membership.create({ data: { userId: LEAVING_ID, orgId: org.id, role: "manager" } });
    const injected = new Error("notification write failed");
    const failing = db.$extends({
      query: {
        notification: {
          $allOperations() {
            throw injected;
          },
        },
      },
    }) as unknown as PrismaClient;

    try {
      await expect(deleteWithFreshOtp(LEAVING_ID, db, failing)).rejects.toBe(injected);

      expect(await db.user.findUnique({ where: { id: LEAVING_ID } })).not.toBeNull();
      expect(await auditRows()).toHaveLength(0);
    } finally {
      await db.organization.delete({ where: { id: org.id } });
    }
  });
});
