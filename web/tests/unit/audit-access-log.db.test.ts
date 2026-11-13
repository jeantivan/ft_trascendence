// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { listAccessesToUser } from "@/lib/gdpr/audit";

// These tests write and delete rows, so they only run against a database whose name ends in _test
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

// Ids no other test file uses: files run in parallel on the same database (#197)
const ACTOR_ID = "18300000-0000-4000-8000-000000000001";
const SUBJECT_ID = "18300000-0000-4000-8000-000000000002";

describe.skipIf(!isTestDatabase)("listAccessesToUser: only accesses, by action too (#183)", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: ACTOR_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  // recordAudit no longer accepts a role with a consent action, but a row like this can still
  // come from a direct write or an older version: the person's own events never count as accesses
  it("leaves out the person's own events even when the row has a role", async () => {
    const base = { actorId: ACTOR_ID, subjectId: SUBJECT_ID, resource: "account" };
    await db.auditLog.create({
      data: { ...base, actorRole: "manager", action: "read", createdAt: new Date("2026-10-05T09:10:00Z") },
    });
    await db.auditLog.create({ data: { ...base, actorRole: "manager", action: "consent_given" } });
    await db.auditLog.create({ data: { ...base, actorRole: "admin", action: "consent_withdrawn" } });
    await db.auditLog.create({ data: { ...base, actorRole: "admin", action: "account_deleted" } });

    expect(await listAccessesToUser(db, SUBJECT_ID)).toEqual([
      { created_at: "2026-10-05T09:10:00.000Z", action: "read", resource: "account", actor_role: "manager" },
    ]);
  });
});
