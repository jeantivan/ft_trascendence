// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { deleteAccount } from "@/lib/gdpr/delete-account";

// These tests delete rows, so they only run against a database whose name ends
// in _test (the db-test container). Without DATABASE_URL_TEST they are skipped.
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

const LEAVING_ID = "44444444-4444-4444-8444-444444444444";
const STAYING_ID = "55555555-5555-4555-8555-555555555555";

describe.skipIf(!isTestDatabase)("deleteAccount", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeAll(async () => {
    for (const [id, email] of [
      [LEAVING_ID, "delete-account-1@example.test"],
      [STAYING_ID, "delete-account-2@example.test"],
    ]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email } });
      await db.emailOtpCode.create({
        data: {
          userId: id,
          purpose: "delete_account",
          codeHash: "irrelevant-hash",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          consumedAt: null,
        },
      });
    }
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [LEAVING_ID, STAYING_ID] } } });
    await db.$disconnect();
  });

  it("borra el usuario y sus datos en cascada, sin tocar a otro usuario", async () => {
    await deleteAccount(LEAVING_ID, db);

    expect(await db.user.findUnique({ where: { id: LEAVING_ID } })).toBeNull();
    expect(await db.emailOtpCode.count({ where: { userId: LEAVING_ID } })).toBe(0);
    expect(await db.user.findUnique({ where: { id: STAYING_ID } })).not.toBeNull();
    expect(await db.emailOtpCode.count({ where: { userId: STAYING_ID } })).toBe(1);
  });
});
