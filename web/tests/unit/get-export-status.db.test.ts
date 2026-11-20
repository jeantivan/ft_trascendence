// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { getExportStatus } from "@/lib/gdpr/export/get-export-status";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999998";

describe("getExportStatus", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeEach(async () => {
    await db.user.create({ data: { id: USER_ID, email: "export-status@example.test" } });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns the status and expiry of the user's own export", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const row = await db.dataExport.create({
      data: { userId: USER_ID, status: "ready", tokenHash: "h", path: "exports/x.zip", expiresAt },
    });

    expect(await getExportStatus(USER_ID, row.id, db)).toEqual({ status: "ready", expiresAt });
  });

  it("returns null for another user's export, the same as for an unknown id", async () => {
    const row = await db.dataExport.create({ data: { userId: USER_ID } });

    expect(await getExportStatus(OTHER_USER_ID, row.id, db)).toBeNull();
    expect(await getExportStatus(USER_ID, "00000000-0000-4000-8000-000000000000", db)).toBeNull();
  });
});
