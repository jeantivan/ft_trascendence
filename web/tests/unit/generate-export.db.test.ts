// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { generateExport } from "@/lib/gdpr/export/generate-export";
import { readZipEntries } from "../support/read-zip-entries";

// These tests write rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-11-15T12:00:00.000Z");

describe("generateExport", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  // Never /data/uploads: every test gets its own temp directory
  let uploadsDir: string;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "generate-export-uploads-"));
    await db.user.create({ data: { id: USER_ID, email: "generate-export@example.test", nick: "runner" } });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("writes the ZIP, marks the export ready and returns a token whose hash is the only one stored", async () => {
    const { id } = await db.dataExport.create({ data: { userId: USER_ID } });

    const result = await generateExport(id, db, uploadsDir, NOW);

    expect(result.ready).toBe(true);
    if (!result.ready) return;
    const row = await db.dataExport.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      status: "ready",
      path: `exports/${id}.zip`,
      expiresAt: new Date("2026-11-22T12:00:00.000Z"),
    });
    expect(row.tokenHash).toBe(createHash("sha256").update(result.token).digest("hex"));
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const entries = await readZipEntries(path.join(uploadsDir, `exports/${id}.zip`));
    expect(Object.keys(entries).sort()).toEqual(["README.txt", "data.json"]);
  });

  it("marks the export failed and leaves no file when the ZIP cannot be written", async () => {
    const { id } = await db.dataExport.create({ data: { userId: USER_ID } });
    // A regular file where the exports folder should be: creating the folder fails
    await writeFile(path.join(uploadsDir, "exports"), "not a folder");

    const result = await generateExport(id, db, uploadsDir, NOW);

    expect(result).toEqual({ ready: false });
    const row = await db.dataExport.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "failed", tokenHash: null, path: null, expiresAt: null });
  });

  it("does nothing when the export is no longer pending", async () => {
    const { id } = await db.dataExport.create({ data: { userId: USER_ID, status: "failed" } });

    expect(await generateExport(id, db, uploadsDir, NOW)).toEqual({ ready: false });
    expect(existsSync(path.join(uploadsDir, `exports/${id}.zip`))).toBe(false);
    expect((await db.dataExport.findUniqueOrThrow({ where: { id } })).status).toBe("failed");
  });
});
