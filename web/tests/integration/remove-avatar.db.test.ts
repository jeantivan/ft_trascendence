// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { removeAvatar } from "@/lib/uploads/remove-avatar";

const TEST_USER_ID = "c0000000-0000-4000-8000-000000000001";
const TEST_EMAIL = "remove-avatar-integration@example.test";

describe("Integration: removeAvatar against real Postgres", () => {
  let uploadsDir: string;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "remove-avatar-db-test-"));
    await prisma.avatar.deleteMany({ where: { ownerId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });

    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        nick: "runner-test",
        image: "/api/files/test-avatar",
      },
    });
  });

  afterEach(async () => {
    await prisma.avatar.deleteMany({ where: { ownerId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("locks user, clears image, deletes avatar row and removes file from disk", async () => {
    const relativePath = "avatars/test-real.png";
    const fullPath = path.join(uploadsDir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, "image-content");

    await prisma.avatar.create({
      data: {
        ownerId: TEST_USER_ID,
        mimeType: "image/png",
        sizeBytes: 13,
        path: relativePath,
      },
    });

    const result = await removeAvatar(TEST_USER_ID, prisma, uploadsDir);

    expect(result).toEqual({ removed: true });

    const updatedUser = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
    expect(updatedUser?.image).toBeNull();

    const avatars = await prisma.avatar.findMany({ where: { ownerId: TEST_USER_ID } });
    expect(avatars).toHaveLength(0);

    expect(existsSync(fullPath)).toBe(false);
  });

  it("keeps DB consistent and reports cleanup failure when file removal fails", async () => {
    const relativePath = "avatars/unremovable.png";
    const fullPath = path.join(uploadsDir, relativePath);
    // Creating a directory at the file path causes unlink to fail
    await mkdir(fullPath, { recursive: true });

    await prisma.avatar.create({
      data: {
        ownerId: TEST_USER_ID,
        mimeType: "image/png",
        sizeBytes: 0,
        path: relativePath,
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await removeAvatar(TEST_USER_ID, prisma, uploadsDir);
    expect(warnSpy).toHaveBeenCalledWith("Avatar removed, but 1 file(s) could not be deleted");
    warnSpy.mockRestore();

    expect(result).toEqual({ removed: true, avatarCleanupFailed: 1 });

    const updatedUser = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
    expect(updatedUser?.image).toBeNull();

    const avatars = await prisma.avatar.findMany({ where: { ownerId: TEST_USER_ID } });
    expect(avatars).toHaveLength(0);
  });
});
