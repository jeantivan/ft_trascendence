// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { issueOtp, OTP_MAX_ATTEMPTS } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";
import { deleteWithFreshOtp, issueDeleteCode } from "../support/delete-account-helper";

// These tests delete rows, so they only run against a database whose name ends
// in _test (the db-test container). Without DATABASE_URL_TEST they are skipped.
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

const LEAVING_ID = "44444444-4444-4444-8444-444444444444";
const STAYING_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

// Real password hashing on every OTP: with other test files running in parallel the 5 s default is too tight
describe.skipIf(!isTestDatabase)("deleteAccountWithOtp", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  // An OTP written straight to the table, for states issueOtp never produces
  async function seedOtp(userId: string, code: string, overrides: { expiresAt?: Date; consumedAt?: Date | null } = {}) {
    await db.emailOtpCode.create({
      data: {
        userId,
        purpose: "delete_account",
        codeHash: await hashPassword(code),
        createdAt: new Date(),
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
        consumedAt: overrides.consumedAt ?? null,
      },
    });
  }

  async function exists(id: string) {
    return (await db.user.findUnique({ where: { id } })) !== null;
  }

  beforeEach(async () => {
    for (const [id, email] of [
      [LEAVING_ID, "delete-account-1@example.test"],
      [STAYING_ID, "delete-account-2@example.test"],
    ]) {
      await db.user.create({ data: { id, email } });
    }
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: { in: [LEAVING_ID, STAYING_ID, ADMIN_ID] } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("con el código correcto borra el usuario y sus datos en cascada, sin tocar a otro", async () => {
    await seedOtp(STAYING_ID, "654321");

    expect(await deleteWithFreshOtp(LEAVING_ID, db)).toEqual({ deleted: true });

    expect(await exists(LEAVING_ID)).toBe(false);
    // Its OTP went with it by cascade, so "consumed" cannot be checked here (the repository contract does)
    expect(await db.emailOtpCode.count({ where: { userId: LEAVING_ID } })).toBe(0);
    expect(await exists(STAYING_ID)).toBe(true);
    expect(await db.emailOtpCode.count({ where: { userId: STAYING_ID } })).toBe(1);
  });

  it("con un código incorrecto no borra nada y gasta un intento", async () => {
    // Known codes: the wrong one is well formed (6 digits) but not the issued one
    await seedOtp(LEAVING_ID, "111111");

    expect(await deleteAccountWithOtp(LEAVING_ID, "222222", db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await exists(LEAVING_ID)).toBe(true);
    const otp = await db.emailOtpCode.findFirstOrThrow({ where: { userId: LEAVING_ID } });
    expect(otp.attempts).toBe(1);
    expect(otp.consumedAt).toBeNull();
  });

  it("rechaza el código de otro usuario y no borra a ninguno", async () => {
    // Known and different codes, so the other user's code can never be the right one
    await seedOtp(LEAVING_ID, "111111");
    await seedOtp(STAYING_ID, "222222");

    expect(await deleteAccountWithOtp(LEAVING_ID, "222222", db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await exists(LEAVING_ID)).toBe(true);
    expect(await exists(STAYING_ID)).toBe(true);
  });

  it("rechaza un código emitido para otro propósito y lo deja sin consumir", async () => {
    // A valid export_data code must not authorize a deletion
    const issued = await issueOtp(LEAVING_ID, "export_data", new PrismaOtpRepository(db));
    if (!issued.issued) throw new Error("test setup: OTP not issued");

    expect(await deleteAccountWithOtp(LEAVING_ID, issued.code, db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await exists(LEAVING_ID)).toBe(true);
    const otp = await db.emailOtpCode.findFirstOrThrow({ where: { userId: LEAVING_ID, purpose: "export_data" } });
    expect(otp.consumedAt).toBeNull();
  });

  it("rechaza un código ya caducado", async () => {
    await seedOtp(LEAVING_ID, "123456", { expiresAt: new Date(Date.now() - 1000) });

    expect(await deleteAccountWithOtp(LEAVING_ID, "123456", db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await exists(LEAVING_ID)).toBe(true);
  });

  it("rechaza un código ya consumido", async () => {
    await seedOtp(LEAVING_ID, "123456", { consumedAt: new Date() });

    expect(await deleteAccountWithOtp(LEAVING_ID, "123456", db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await exists(LEAVING_ID)).toBe(true);
  });

  it("rechaza el código correcto cuando ya se agotaron los intentos", async () => {
    const code = await issueDeleteCode(db, LEAVING_ID);
    await db.emailOtpCode.updateMany({ where: { userId: LEAVING_ID }, data: { attempts: OTP_MAX_ATTEMPTS } });

    expect(await deleteAccountWithOtp(LEAVING_ID, code, db)).toEqual({ deleted: false, reason: "invalid_code" });

    expect(await exists(LEAVING_ID)).toBe(true);
  });

  it("si falla el borrado, el código sigue sin consumir y el intento reservado permanece", async () => {
    // Makes the transaction fail after the code has been consumed: a Manager of a club with an Admin
    // to notify, with every notification write throwing
    await db.user.create({ data: { id: ADMIN_ID, email: "delete-account-admin@example.test", roleGlobal: "admin" } });
    const org = await db.organization.create({ data: { name: "rollback-club", timezone: "Europe/Madrid" } });
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

      expect(await exists(LEAVING_ID)).toBe(true);
      const otp = await db.emailOtpCode.findFirstOrThrow({ where: { userId: LEAVING_ID } });
      expect(otp.consumedAt).toBeNull();
      expect(otp.attempts).toBe(1);
    } finally {
      await db.organization.delete({ where: { id: org.id } });
    }
  });

  it("con dos solicitudes simultáneas con el mismo código, solo una completa el borrado", async () => {
    const code = await issueDeleteCode(db, LEAVING_ID);

    // allSettled: an unexpected exception in either request fails the test instead of passing as "rejected"
    const results = await Promise.allSettled([
      deleteAccountWithOtp(LEAVING_ID, code, db),
      deleteAccountWithOtp(LEAVING_ID, code, db),
    ]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const values = results.map((result) => (result as PromiseFulfilledResult<unknown>).value);
    expect(values).toContainEqual({ deleted: true });
    expect(values).toContainEqual({ deleted: false, reason: "invalid_code" });
    expect(await exists(LEAVING_ID)).toBe(false);
  });
});
