// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { requestExport } from "@/lib/gdpr/export/request-export";
import { issueOtp } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "77777777-7777-4777-8777-777777777777";

// Real password hashing on every OTP: with other test files running in parallel the 5 s default is too tight
describe("requestExport", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function issueExportCode(userId: string): Promise<string> {
    const result = await issueOtp(userId, "export_data", new PrismaOtpRepository(db));
    if (!result.issued) throw new Error("test setup: the OTP cooldown has not passed");
    return result.code;
  }

  beforeEach(async () => {
    await db.user.create({ data: { id: USER_ID, email: "request-export@example.test" } });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates a pending export when the code is valid", async () => {
    const code = await issueExportCode(USER_ID);

    const result = await requestExport(USER_ID, code, db);

    expect(result.requested).toBe(true);
    const rows = await db.dataExport.findMany({ where: { userId: USER_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", tokenHash: null, path: null, expiresAt: null });
    if (result.requested) expect(result.exportId).toBe(rows[0].id);
  });

  it("rejects a wrong code and creates nothing", async () => {
    await issueExportCode(USER_ID);

    const result = await requestExport(USER_ID, "000000", db);

    expect(result).toEqual({ requested: false, reason: "invalid_code" });
    expect(await db.dataExport.count({ where: { userId: USER_ID } })).toBe(0);
  });

  it("rejects a code issued for another purpose", async () => {
    const result = await issueOtp(USER_ID, "delete_account", new PrismaOtpRepository(db));
    if (!result.issued) throw new Error("test setup");

    expect(await requestExport(USER_ID, result.code, db)).toEqual({ requested: false, reason: "invalid_code" });
  });

  it("answers already_active while a pending export exists, and keeps the code unused", async () => {
    await db.dataExport.create({ data: { userId: USER_ID } });
    const code = await issueExportCode(USER_ID);

    const result = await requestExport(USER_ID, code, db);

    expect(result).toEqual({ requested: false, reason: "already_active" });
    expect(await db.dataExport.count({ where: { userId: USER_ID } })).toBe(1);
    const otp = await db.emailOtpCode.findFirst({ where: { userId: USER_ID, purpose: "export_data" } });
    expect(otp?.consumedAt).toBeNull();
  });

  it("answers already_active for a ready export that has not expired, but not for an expired one", async () => {
    await db.dataExport.create({
      data: { userId: USER_ID, status: "ready", tokenHash: "h", path: "exports/a.zip", expiresAt: new Date(Date.now() + 60_000) },
    });
    expect(await requestExport(USER_ID, await issueExportCode(USER_ID), db)).toEqual({
      requested: false,
      reason: "already_active",
    });

    await db.dataExport.updateMany({ where: { userId: USER_ID }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    // The cooldown between codes is 60 s: age the previous one so a new code can be issued
    await db.emailOtpCode.updateMany({ where: { userId: USER_ID }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const result = await requestExport(USER_ID, await issueExportCode(USER_ID), db);

    expect(result.requested).toBe(true);
  });

  it("does not count a failed export as active, and deletes it", async () => {
    const failed = await db.dataExport.create({ data: { userId: USER_ID, status: "failed" } });

    const result = await requestExport(USER_ID, await issueExportCode(USER_ID), db);

    expect(result.requested).toBe(true);
    const rows = await db.dataExport.findMany({ where: { userId: USER_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(failed.id);
  });

  it("treats a pending export older than 15 minutes as stuck and lets a new one start", async () => {
    const stuck = await db.dataExport.create({
      data: { userId: USER_ID, createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });

    const result = await requestExport(USER_ID, await issueExportCode(USER_ID), db);

    expect(result.requested).toBe(true);
    expect(await db.dataExport.findUnique({ where: { id: stuck.id } })).toBeNull();
  });

  it("creates a single export when two requests with the same code arrive together", async () => {
    const code = await issueExportCode(USER_ID);

    const results = await Promise.all([requestExport(USER_ID, code, db), requestExport(USER_ID, code, db)]);

    expect(results.filter((result) => result.requested)).toHaveLength(1);
    expect(await db.dataExport.count({ where: { userId: USER_ID } })).toBe(1);
  });
});
