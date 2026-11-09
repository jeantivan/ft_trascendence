// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { listAccessesToUser, purgeOldAuditRows, recordAudit } from "@/lib/gdpr/audit";
import { deleteWithFreshOtp } from "../support/delete-account-helper";

// These tests write and delete rows, so they only run against a database whose name ends in _test
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

const ACTOR_ID = "99999999-9999-4999-8999-999999999991";
const SUBJECT_ID = "99999999-9999-4999-8999-999999999992";

describe.skipIf(!isTestDatabase)("recordAudit", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const rows = () => db.auditLog.findMany({ where: { actorId: ACTOR_ID } });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: ACTOR_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("writes one row with the given ids and no data value", async () => {
    await db.$transaction((tx) =>
      recordAudit(tx, {
        actorId: ACTOR_ID,
        subjectId: SUBJECT_ID,
        actorRole: "manager",
        action: "read",
        resource: "feedback",
        resourceId: "abc",
      }),
    );

    const found = await rows();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ subjectId: SUBJECT_ID, actorRole: "manager", action: "read", resource: "feedback", resourceId: "abc" });
  });

  it("leaves no row if the transaction rolls back", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await recordAudit(tx, { actorId: ACTOR_ID, subjectId: SUBJECT_ID, actorRole: "admin", action: "update", resource: "feedback", resourceId: null });
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    expect(await rows()).toHaveLength(0);
  });
});

describe.skipIf(!isTestDatabase)("purgeOldAuditRows", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: ACTOR_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("deletes only the rows older than 12 months", async () => {
    // Cutoff is 2025-06-15: one day inside the 12 months stays, one day outside goes
    const now = new Date("2026-06-15T12:00:00Z");
    const row = { actorId: ACTOR_ID, subjectId: SUBJECT_ID, actorRole: "manager" as const, action: "read" as const, resource: "feedback" };
    await db.auditLog.create({ data: { ...row, createdAt: new Date("2025-06-16T12:00:00Z") } });
    await db.auditLog.create({ data: { ...row, createdAt: new Date("2025-06-14T12:00:00Z") } });

    expect(await purgeOldAuditRows(db, now)).toBe(1);

    const left = await db.auditLog.findMany({ where: { actorId: ACTOR_ID } });
    expect(left).toHaveLength(1);
    expect(left[0].createdAt).toEqual(new Date("2025-06-16T12:00:00Z"));
  });
});

describe.skipIf(!isTestDatabase)("listAccessesToUser", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const OTHER_SUBJECT_ID = "99999999-9999-4999-8999-999999999993";

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: ACTOR_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns only third-party accesses to the subject, with the four spec fields", async () => {
    const base = { actorId: ACTOR_ID, resource: "session_log" };
    await db.auditLog.create({
      data: { ...base, subjectId: SUBJECT_ID, actorRole: "manager", action: "read", createdAt: new Date("2026-10-05T09:10:00Z") },
    });
    // Not accesses by a third party, or not to this subject: all must be left out
    await db.auditLog.create({ data: { ...base, subjectId: SUBJECT_ID, actorRole: null, action: "consent_given" } });
    await db.auditLog.create({ data: { ...base, subjectId: SUBJECT_ID, actorRole: null, action: "account_deleted" } });
    await db.auditLog.create({ data: { ...base, subjectId: OTHER_SUBJECT_ID, actorRole: "admin", action: "update" } });

    expect(await listAccessesToUser(db, SUBJECT_ID)).toEqual([
      { created_at: "2026-10-05T09:10:00.000Z", action: "read", resource: "session_log", actor_role: "manager" },
    ]);
  });
});

describe.skipIf(!isTestDatabase)("audit rows and account deletion", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const WATCHER_ID = "99999999-9999-4999-8999-999999999994";
  const WATCHED_ID = "99999999-9999-4999-8999-999999999995";

  // The row of the access itself: deleting an account also writes its own account_deleted row
  const accessRows = () => db.auditLog.findMany({ where: { actorId: WATCHER_ID, resource: "session_log" } });

  beforeEach(async () => {
    await db.user.create({ data: { id: WATCHER_ID, email: "audit-watcher@example.test" } });
    await db.user.create({ data: { id: WATCHED_ID, email: "audit-watched@example.test" } });
    await db.auditLog.create({
      data: { actorId: WATCHER_ID, subjectId: WATCHED_ID, actorRole: "manager", action: "read", resource: "session_log" },
    });
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: { in: [WATCHER_ID, WATCHED_ID] } } });
    await db.user.deleteMany({ where: { id: { in: [WATCHER_ID, WATCHED_ID] } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("keeps the row when the subject deletes their account", async () => {
    expect(await deleteWithFreshOtp(WATCHED_ID, db)).toEqual({ deleted: true });

    expect(await accessRows()).toHaveLength(1);
  });

  it("keeps the row when the actor deletes their account", async () => {
    expect(await deleteWithFreshOtp(WATCHER_ID, db)).toEqual({ deleted: true });

    expect(await accessRows()).toHaveLength(1);
  });
});
