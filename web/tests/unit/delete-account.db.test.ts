// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { issueOtp, OTP_MAX_ATTEMPTS } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";
import { deleteWithFreshOtp, failNotifications, issueDeleteCode } from "../support/delete-account-helper";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const LEAVING_ID = "44444444-4444-4444-8444-444444444444";
const STAYING_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

// Real password hashing on every OTP: with other test files running in parallel the 5 s default is too tight
describe("deleteAccountWithOtp", { timeout: 30_000 }, () => {
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

  // Never /data/uploads: every test gets its own temp directory
  let uploadsDir: string;

  // An Avatar row plus what is on disk for it: a file, a directory (unlink fails on it) or nothing
  async function seedAvatar(ownerId: string, relativePath: string, onDisk: "file" | "directory" | "missing" = "file") {
    await db.avatar.create({ data: { ownerId, mimeType: "image/png", sizeBytes: 1, path: relativePath } });
    const fullPath = path.join(uploadsDir, relativePath);
    if (onDisk === "missing") return;
    await mkdir(onDisk === "directory" ? fullPath : path.dirname(fullPath), { recursive: true });
    if (onDisk === "file") await writeFile(fullPath, "x");
  }

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "delete-account-uploads-"));
    for (const [id, email] of [
      [LEAVING_ID, "delete-account-1@example.test"],
      [STAYING_ID, "delete-account-2@example.test"],
    ]) {
      await db.user.create({ data: { id, email } });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // account_deleted rows have no FK to User, so deleting the users does not remove them
    await db.auditLog.deleteMany({ where: { actorId: { in: [LEAVING_ID, STAYING_ID, ADMIN_ID] } } });
    await db.user.deleteMany({ where: { id: { in: [LEAVING_ID, STAYING_ID, ADMIN_ID] } } });
    await rm(uploadsDir, { recursive: true, force: true });
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
    const { injected, failing } = failNotifications(db);

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

  describe("archivos de avatar", () => {
    it("borra los archivos de la cuenta tras el borrado y no deja filas", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await seedAvatar(LEAVING_ID, "avatars/a.png");
      await seedAvatar(LEAVING_ID, "avatars/b.webp");

      expect(await deleteWithFreshOtp(LEAVING_ID, db, db, uploadsDir)).toEqual({ deleted: true });

      expect(await exists(LEAVING_ID)).toBe(false);
      expect(await db.avatar.count({ where: { ownerId: LEAVING_ID } })).toBe(0);
      expect(existsSync(path.join(uploadsDir, "avatars", "a.png"))).toBe(false);
      expect(existsSync(path.join(uploadsDir, "avatars", "b.webp"))).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("un archivo que ya no existe cuenta como limpio", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await seedAvatar(LEAVING_ID, "avatars/gone.png", "missing");

      expect(await deleteWithFreshOtp(LEAVING_ID, db, db, uploadsDir)).toEqual({ deleted: true });

      expect(await exists(LEAVING_ID)).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("con un código incorrecto no toca el disco ni las filas", async () => {
      await seedOtp(LEAVING_ID, "111111");
      await seedAvatar(LEAVING_ID, "avatars/a.png");

      expect(await deleteAccountWithOtp(LEAVING_ID, "222222", db, uploadsDir)).toEqual({
        deleted: false,
        reason: "invalid_code",
      });

      expect(existsSync(path.join(uploadsDir, "avatars", "a.png"))).toBe(true);
      expect(await db.avatar.count({ where: { ownerId: LEAVING_ID } })).toBe(1);
      expect(await exists(LEAVING_ID)).toBe(true);
    });

    it("si falla la transacción no toca el disco ni las filas", async () => {
      // Same failure as the rollback test: a Manager of a club with an Admin to notify, notification writes throwing
      await db.user.create({ data: { id: ADMIN_ID, email: "delete-account-admin@example.test", roleGlobal: "admin" } });
      const org = await db.organization.create({ data: { name: "avatar-rollback-club", timezone: "Europe/Madrid" } });
      await db.membership.create({ data: { userId: LEAVING_ID, orgId: org.id, role: "manager" } });
      await seedAvatar(LEAVING_ID, "avatars/a.png");
      const { injected, failing } = failNotifications(db);

      try {
        await expect(deleteWithFreshOtp(LEAVING_ID, db, failing, uploadsDir)).rejects.toBe(injected);

        expect(existsSync(path.join(uploadsDir, "avatars", "a.png"))).toBe(true);
        expect(await db.avatar.count({ where: { ownerId: LEAVING_ID } })).toBe(1);
        expect(await exists(LEAVING_ID)).toBe(true);
      } finally {
        await db.organization.delete({ where: { id: org.id } });
      }
    });

    it("si un archivo no se puede borrar, la cuenta y sus filas se borran igualmente y el resultado indica limpieza incompleta", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      // A directory cannot be unlinked: stands in for a disk error after the commit
      await seedAvatar(LEAVING_ID, "avatars/stuck", "directory");
      await seedAvatar(LEAVING_ID, "avatars/ok.png");

      const result = await deleteWithFreshOtp(LEAVING_ID, db, db, uploadsDir);

      expect(result).toEqual({ deleted: true, avatarCleanupFailed: 1 });
      expect(await exists(LEAVING_ID)).toBe(false);
      expect(await db.avatar.count({ where: { ownerId: LEAVING_ID } })).toBe(0);
      // The failure did not stop the other file; the one that failed is still on disk
      expect(existsSync(path.join(uploadsDir, "avatars", "ok.png"))).toBe(false);
      expect(existsSync(path.join(uploadsDir, "avatars", "stuck"))).toBe(true);
      // Only the count: no path, no email
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Account deleted, but 1 avatar file(s) could not be removed");
    });
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
