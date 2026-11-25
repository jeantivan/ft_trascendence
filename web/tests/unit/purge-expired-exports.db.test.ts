// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { purgeExpiredExports } from "@/lib/gdpr/export/purge-expired-exports";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "88888888-8888-4888-8888-888888888887";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("purgeExpiredExports", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let uploadsDir: string;
  let exportsDir: string;
  const now = new Date();

  beforeEach(async () => {
    await db.user.create({ data: { id: USER_ID, email: "purge-export@example.test" } });
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "purge-exports-"));
    exportsDir = path.join(uploadsDir, "exports");
    await mkdir(exportsDir);
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  function readyExport(expiresAt: Date) {
    return db.dataExport.create({
      data: { userId: USER_ID, status: "ready", tokenHash: "h", path: "exports/x.zip", expiresAt, deliveredAt: new Date() },
    });
  }

  async function writeFileAged(name: string, ageMs: number) {
    const file = path.join(exportsDir, name);
    await writeFile(file, "zip");
    const mtime = new Date(now.getTime() - ageMs);
    await utimes(file, mtime, mtime);
  }

  it("removes the ZIP and the row of an expired export, and keeps one that is still valid", async () => {
    const expired = await readyExport(new Date(now.getTime() - MINUTE));
    const valid = await readyExport(new Date(now.getTime() + MINUTE));
    await writeFileAged(`${expired.id}.zip`, 8 * DAY);
    await writeFileAged(`${valid.id}.zip`, DAY);

    const removed = await purgeExpiredExports(db, uploadsDir, now);

    expect(removed).toBe(1);
    expect(await db.dataExport.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.dataExport.findUnique({ where: { id: valid.id } })).not.toBeNull();
    expect(await readdir(exportsDir)).toEqual([`${valid.id}.zip`]);
  });

  it("removes the row of an expired export whose ZIP is already gone", async () => {
    const expired = await readyExport(new Date(now.getTime() - MINUTE));

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(1);
    expect(await db.dataExport.findUnique({ where: { id: expired.id } })).toBeNull();
  });

  it("keeps the row when the ZIP cannot be removed, and retries on the next run", async () => {
    const expired = await readyExport(new Date(now.getTime() - MINUTE));
    // A folder with the ZIP's name: rm without recursive refuses it
    const zip = path.join(exportsDir, `${expired.id}.zip`);
    await mkdir(zip);

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(0);
    expect(await db.dataExport.findUnique({ where: { id: expired.id } })).not.toBeNull();

    await rm(zip, { recursive: true });
    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(1);
    expect(await db.dataExport.findUnique({ where: { id: expired.id } })).toBeNull();
  });

  it("keeps going with the other exports when one ZIP cannot be removed", async () => {
    const stuck = await readyExport(new Date(now.getTime() - MINUTE));
    const other = await readyExport(new Date(now.getTime() - MINUTE));
    await mkdir(path.join(exportsDir, `${stuck.id}.zip`));
    await writeFileAged(`${other.id}.zip`, 8 * DAY);

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(1);
    expect(await db.dataExport.findUnique({ where: { id: other.id } })).toBeNull();
    expect(await db.dataExport.findUnique({ where: { id: stuck.id } })).not.toBeNull();
  });

  it("removes failed exports older than 7 days and keeps newer ones", async () => {
    const old = await db.dataExport.create({ data: { userId: USER_ID, status: "failed", createdAt: new Date(now.getTime() - 7 * DAY - MINUTE) } });
    const recent = await db.dataExport.create({ data: { userId: USER_ID, status: "failed", createdAt: new Date(now.getTime() - 6 * DAY) } });

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(1);
    expect(await db.dataExport.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.dataExport.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });

  it("removes pending exports older than 15 minutes (with their .tmp) and keeps newer ones", async () => {
    const stuck = await db.dataExport.create({ data: { userId: USER_ID, createdAt: new Date(now.getTime() - 16 * MINUTE) } });
    const fresh = await db.dataExport.create({ data: { userId: USER_ID, createdAt: new Date(now.getTime() - 5 * MINUTE) } });
    await writeFileAged(`${stuck.id}.zip.tmp`, 16 * MINUTE);
    await writeFileAged(`${fresh.id}.zip.tmp`, 5 * MINUTE);

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(1);
    expect(await db.dataExport.findUnique({ where: { id: stuck.id } })).toBeNull();
    expect(await db.dataExport.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await readdir(exportsDir)).toEqual([`${fresh.id}.zip.tmp`]);
  });

  it("removes ZIPs and .tmp files without a row once they are older than 10 minutes", async () => {
    const orphan = randomUUID();
    const orphanTmp = randomUUID();
    const young = randomUUID();
    await writeFileAged(`${orphan}.zip`, 11 * MINUTE);
    await writeFileAged(`${orphanTmp}.zip.tmp`, 11 * MINUTE);
    await writeFileAged(`${young}.zip`, 5 * MINUTE);

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(2);
    expect(await readdir(exportsDir)).toEqual([`${young}.zip`]);
  });

  it("does not touch files whose row is pending or ready and valid, or files that are not exports", async () => {
    const pending = await db.dataExport.create({ data: { userId: USER_ID } });
    const ready = await readyExport(new Date(now.getTime() + MINUTE));
    await writeFileAged(`${pending.id}.zip.tmp`, DAY);
    await writeFileAged(`${ready.id}.zip`, DAY);
    await writeFileAged("notes.txt", DAY);

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(0);
    expect((await readdir(exportsDir)).sort()).toEqual([`${pending.id}.zip.tmp`, `${ready.id}.zip`, "notes.txt"].sort());
  });

  it("does nothing when the exports folder does not exist yet", async () => {
    await rm(exportsDir, { recursive: true });

    expect(await purgeExpiredExports(db, uploadsDir, now)).toBe(0);
  });
});
