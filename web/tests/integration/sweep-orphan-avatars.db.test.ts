// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sweepOrphanAvatars } from "@/lib/uploads/sweep-orphan-avatars";

// The real module, except unlink is a mock that calls the real one: a test can
// still make it fail with mockImplementation (as in delete-avatar-files.test.ts)
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, unlink: vi.fn(actual.unlink) };
});

const OWNER_ID = "c0000000-0000-4000-8000-000000000254";
const OWNER_EMAIL = "sweep-orphan-avatars@example.test";
// Whole seconds: a file's modification time is stored in nanoseconds, and a date with
// milliseconds can come back 1 ms off, which would move the files at the exact limit
const NOW = new Date("2099-01-01T12:00:00Z");
const MINUTE = 60 * 1000;

describe("Integration: sweepOrphanAvatars against real Postgres", () => {
  let uploadsDir: string;

  // Writes uploadsDir/<relativePath> with its modification time ageMs before NOW
  async function fileAt(relativePath: string, ageMs: number): Promise<string> {
    const fullPath = path.join(uploadsDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, "image-content");
    const modified = new Date(NOW.getTime() - ageMs);
    await utimes(fullPath, modified, modified);
    return fullPath;
  }

  async function avatarFile(name: string, ageMs: number): Promise<string> {
    return fileAt(path.join("avatars", name), ageMs);
  }

  async function pointerTo(name: string): Promise<void> {
    await prisma.avatar.create({
      data: { ownerId: OWNER_ID, mimeType: "image/png", sizeBytes: 13, path: path.join("avatars", name) },
    });
  }

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "sweep-orphan-avatars-"));
    await prisma.user.deleteMany({ where: { id: OWNER_ID } });
    await prisma.user.create({ data: { id: OWNER_ID, email: OWNER_EMAIL } });
  });

  afterEach(async () => {
    // The config does not restore mocks between tests: back to the real unlink, and
    // console.warn back to printing
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(unlink).mockImplementation(actual.unlink);
    vi.restoreAllMocks();
    // Its Avatar rows go with it (onDelete: Cascade)
    await prisma.user.deleteMany({ where: { id: OWNER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes a file with no Avatar row that is older than 10 minutes", async () => {
    const orphan = await avatarFile("orphan.png", 11 * MINUTE);

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(1);

    expect(existsSync(orphan)).toBe(false);
  });

  it("keeps a file that has an Avatar row, however old, and keeps the row", async () => {
    const inUse = await avatarFile("in-use.png", 30 * 24 * 60 * MINUTE);
    await pointerTo("in-use.png");

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(0);

    expect(existsSync(inUse)).toBe(true);
    await expect(prisma.avatar.count({ where: { ownerId: OWNER_ID } })).resolves.toBe(1);
  });

  // An upload writes its file before committing its row: a recent file with no row
  // may be an upload still in progress
  it("keeps a file with no Avatar row that is only 9 minutes old", async () => {
    const uploading = await avatarFile("uploading.png", 9 * MINUTE);

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(0);

    expect(existsSync(uploading)).toBe(true);
  });

  // More than 10 minutes, not 10 or more (#254)
  it("keeps a file with no row at exactly 10 minutes and deletes it one second later", async () => {
    const atLimit = await avatarFile("at-limit.png", 10 * MINUTE);
    const pastLimit = await avatarFile("past-limit.png", 10 * MINUTE + 1000);

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(1);

    expect(existsSync(atLimit)).toBe(true);
    expect(existsSync(pastLimit)).toBe(false);
  });

  // The export ZIPs with no row are #170's; the sweep only owns avatars/
  it("deletes nothing outside avatars/, however old", async () => {
    const orphan = await avatarFile("orphan.png", 11 * MINUTE);
    const zip = await fileAt(path.join("exports", "old.zip"), 30 * 24 * 60 * MINUTE);
    const atRoot = await fileAt("old.txt", 30 * 24 * 60 * MINUTE);

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(1);

    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(zip)).toBe(true);
    expect(existsSync(atRoot)).toBe(true);
  });

  it("leaves a folder inside avatars/ and what it holds, and does not count it", async () => {
    const inside = await avatarFile(path.join("folder", "old.png"), 30 * 24 * 60 * MINUTE);
    const folder = path.dirname(inside);
    const old = new Date(NOW.getTime() - 30 * 24 * 60 * MINUTE);
    await utimes(folder, old, old);

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(0);

    expect(existsSync(folder)).toBe(true);
    expect(existsSync(inside)).toBe(true);
  });

  // saveAvatar creates avatars/ with the first upload: a new clone has none
  it("returns 0 without throwing when avatars/ does not exist yet", async () => {
    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(0);
  });

  // Without the rows it cannot know which files are orphans, so it deletes none
  it("throws and deletes nothing when the Avatar rows cannot be read", async () => {
    const orphan = await avatarFile("orphan.png", 11 * MINUTE);
    const brokenDb = {
      avatar: {
        findMany: async () => {
          throw new Error("database down");
        },
      },
    } as unknown as PrismaClient;

    await expect(sweepOrphanAvatars(brokenDb, uploadsDir, NOW)).rejects.toThrow("database down");

    expect(existsSync(orphan)).toBe(true);
  });

  // Three orphans; unlink fails for b.png only, with a disk error (not ENOENT)
  async function threeOrphansWithBFailing(): Promise<string[]> {
    const files = [
      await avatarFile("a.png", 11 * MINUTE),
      await avatarFile("b.png", 11 * MINUTE),
      await avatarFile("c.png", 11 * MINUTE),
    ];
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(unlink).mockImplementation(async (target) => {
      if (String(target).endsWith("b.png")) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      }
      await actual.unlink(target);
    });
    return files;
  }

  it("keeps deleting the other files when one fails, and counts only the deleted ones", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const [a, b, c] = await threeOrphansWithBFailing();

    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(2);

    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(true);
    expect(existsSync(c)).toBe(false);
  });

  // The whole text: so it carries no path or id, only the count (#254)
  it("warns once with only the number of files it could not delete, and not at all when none fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await threeOrphansWithBFailing();

    await sweepOrphanAvatars(prisma, uploadsDir, NOW);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Orphan avatar sweep: 1 file(s) could not be removed");

    // Next run with the disk working again: b.png goes, and nothing to warn about
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(unlink).mockImplementation(actual.unlink);
    warn.mockClear();
    await expect(sweepOrphanAvatars(prisma, uploadsDir, NOW)).resolves.toBe(1);

    expect(warn).not.toHaveBeenCalled();
  });
});
