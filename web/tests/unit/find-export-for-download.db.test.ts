// @vitest-environment node
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { findExportForDownload } from "@/lib/gdpr/export/find-export-for-download";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "99999999-9999-4999-8999-999999999997";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999996";
const TOKEN = "the-token";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

describe("findExportForDownload", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeEach(async () => {
    await db.user.create({ data: { id: USER_ID, email: "export-download@example.test" } });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  function ready(overrides: { expiresAt?: Date; status?: "pending" | "ready" | "failed" } = {}) {
    return db.dataExport.create({
      data: {
        userId: USER_ID,
        status: overrides.status ?? "ready",
        tokenHash: hash(TOKEN),
        path: "exports/x.zip",
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
      },
    });
  }

  it("returns the path for the owner with the right token", async () => {
    const row = await ready();

    expect(await findExportForDownload(USER_ID, row.id, TOKEN, db)).toBe("exports/x.zip");
  });

  it("returns null for a wrong token", async () => {
    const row = await ready();

    expect(await findExportForDownload(USER_ID, row.id, "other-token", db)).toBeNull();
  });

  it("returns null for another user, even with the right token", async () => {
    const row = await ready();

    expect(await findExportForDownload(OTHER_USER_ID, row.id, TOKEN, db)).toBeNull();
  });

  it("returns null once expired", async () => {
    const row = await ready({ expiresAt: new Date(Date.now() - 1000) });

    expect(await findExportForDownload(USER_ID, row.id, TOKEN, db)).toBeNull();
  });

  it("returns null from the exact moment it expires, while the row and file still exist", async () => {
    const now = new Date();
    const row = await ready({ expiresAt: now });

    expect(await findExportForDownload(USER_ID, row.id, TOKEN, db, now)).toBeNull();
    expect(await db.dataExport.count({ where: { id: row.id } })).toBe(1);
  });

  it("returns null while pending or failed, which have no token", async () => {
    const pending = await db.dataExport.create({ data: { userId: USER_ID } });
    const failed = await ready({ status: "failed" });

    expect(await findExportForDownload(USER_ID, pending.id, TOKEN, db)).toBeNull();
    expect(await findExportForDownload(USER_ID, failed.id, TOKEN, db)).toBeNull();
  });
});
