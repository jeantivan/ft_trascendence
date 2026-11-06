// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAvatarFiles } from "@/lib/uploads/delete-avatar-files";

// The real module, except unlink is a mock that calls the real one: a test can
// still make it fail with mockImplementation
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, unlink: vi.fn(actual.unlink) };
});

// base holds uploads/ plus a file OUTSIDE it, so tests never touch /data/uploads
let base: string;
let uploadsDir: string;

async function createFile(fullPath: string): Promise<void> {
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, "x");
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "delete-avatars-test-"));
  uploadsDir = path.join(base, "uploads");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("deleteAvatarFiles", () => {
  it("deletes the files and reports no failures", async () => {
    await createFile(path.join(uploadsDir, "avatars", "a.png"));
    await createFile(path.join(uploadsDir, "avatars", "b.webp"));

    const failed = await deleteAvatarFiles(["avatars/a.png", "avatars/b.webp"], uploadsDir);

    expect(failed).toBe(0);
    expect(existsSync(path.join(uploadsDir, "avatars", "a.png"))).toBe(false);
    expect(existsSync(path.join(uploadsDir, "avatars", "b.webp"))).toBe(false);
  });

  it("does nothing with an empty list", async () => {
    expect(await deleteAvatarFiles([], uploadsDir)).toBe(0);
  });

  it("counts a file that no longer exists as clean", async () => {
    expect(await deleteAvatarFiles(["avatars/gone.png"], uploadsDir)).toBe(0);
  });

  it("keeps deleting the other files when one fails, and counts only the failure", async () => {
    await createFile(path.join(uploadsDir, "avatars", "a.png"));
    await createFile(path.join(uploadsDir, "avatars", "b.png"));
    await createFile(path.join(uploadsDir, "avatars", "c.png"));
    const { unlink } = await import("node:fs/promises");
    const realUnlink = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).unlink;
    // Only b.png fails, with a disk error (not ENOENT); the rest use the real unlink
    vi.mocked(unlink).mockImplementation(async (target) => {
      if (String(target).endsWith("b.png")) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      }
      await realUnlink(target);
    });

    const failed = await deleteAvatarFiles(["avatars/a.png", "avatars/b.png", "avatars/c.png"], uploadsDir);

    expect(failed).toBe(1);
    expect(existsSync(path.join(uploadsDir, "avatars", "a.png"))).toBe(false);
    expect(existsSync(path.join(uploadsDir, "avatars", "b.png"))).toBe(true);
    expect(existsSync(path.join(uploadsDir, "avatars", "c.png"))).toBe(false);
  });

  // The rules about which paths are allowed are tested in delete-avatar-file.test.ts
  it("counts a path outside uploadsDir as a failure, leaves that file and still deletes the rest", async () => {
    await createFile(path.join(base, "secret.txt"));
    await createFile(path.join(uploadsDir, "avatars", "a.png"));

    const failed = await deleteAvatarFiles(["../secret.txt", "avatars/a.png"], uploadsDir);

    expect(failed).toBe(1);
    expect(existsSync(path.join(base, "secret.txt"))).toBe(true);
    expect(existsSync(path.join(uploadsDir, "avatars", "a.png"))).toBe(false);
  });
});
