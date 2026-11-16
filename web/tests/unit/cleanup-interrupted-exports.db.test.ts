// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { cleanupInterruptedExports } from "@/lib/gdpr/export/cleanup-interrupted-exports";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "88888888-8888-4888-8888-888888888888";

describe("cleanupInterruptedExports", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let uploadsDir: string;

  beforeEach(async () => {
    await db.user.create({ data: { id: USER_ID, email: "cleanup-export@example.test" } });
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "cleanup-exports-"));
    await mkdir(path.join(uploadsDir, "exports"));
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("marks pending exports as failed and leaves ready ones alone", async () => {
    const pending = await db.dataExport.create({ data: { userId: USER_ID } });
    const ready = await db.dataExport.create({
      data: { userId: USER_ID, status: "ready", tokenHash: "h", path: "exports/r.zip", expiresAt: new Date(Date.now() + 60_000) },
    });

    await cleanupInterruptedExports(db, uploadsDir);

    expect((await db.dataExport.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("failed");
    expect((await db.dataExport.findUniqueOrThrow({ where: { id: ready.id } })).status).toBe("ready");
  });

  it("removes the leftover .tmp files and the ZIP of a pending export, but not the ZIP of a ready one", async () => {
    const pending = await db.dataExport.create({ data: { userId: USER_ID } });
    const ready = await db.dataExport.create({
      data: { userId: USER_ID, status: "ready", tokenHash: "h", path: "exports/ready.zip", expiresAt: new Date(Date.now() + 60_000) },
    });
    const readyFile = `${ready.id}.zip`;
    await writeFile(path.join(uploadsDir, "exports", `${pending.id}.zip.tmp`), "half");
    // Killed between the rename and the update to ready: the ZIP has its final name, the row is still pending
    await writeFile(path.join(uploadsDir, "exports", `${pending.id}.zip`), "complete but unclaimed");
    await writeFile(path.join(uploadsDir, "exports", readyFile), "kept");

    await cleanupInterruptedExports(db, uploadsDir);

    expect(await readdir(path.join(uploadsDir, "exports"))).toEqual([readyFile]);
  });

  it("does nothing when the exports folder does not exist yet", async () => {
    await rm(path.join(uploadsDir, "exports"), { recursive: true });

    await expect(cleanupInterruptedExports(db, uploadsDir)).resolves.toBeUndefined();
  });
});
