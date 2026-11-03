// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAvatar } from "@/lib/uploads/save-avatar";

// The real module, except writeFile is a mock that calls the real one: a test can
// still make it fail once with mockImplementationOnce
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

// A fresh, empty uploads directory per test, so tests never touch /data/uploads
let uploadsDir: string;

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), "uploads-test-"));
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
});

describe("saveAvatar", () => {
  it("returns avatars/<uuid>.<extension>", async () => {
    const saved = await saveAvatar(BYTES, "png", uploadsDir);
    expect(saved).toMatch(/^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
  });

  it("writes the bytes at that path, creating avatars/ if missing", async () => {
    const saved = await saveAvatar(BYTES, "webp", uploadsDir);
    const written = await readFile(path.join(uploadsDir, saved));
    expect(new Uint8Array(written)).toEqual(BYTES);
  });

  it("gives each upload its own name, also when avatars/ already exists", async () => {
    const first = await saveAvatar(BYTES, "jpg", uploadsDir);
    const second = await saveAvatar(BYTES, "jpg", uploadsDir);
    expect(second).not.toBe(first);
    expect(new Uint8Array(await readFile(path.join(uploadsDir, first)))).toEqual(BYTES);
  });

  it("removes the partial file and rethrows when the write fails", async () => {
    const real = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    // Like a full disk: part of the bytes land, then the write fails
    vi.mocked(writeFile).mockImplementationOnce(async (file) => {
      await real.writeFile(file, BYTES.slice(0, 3));
      throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    });

    await expect(saveAvatar(BYTES, "png", uploadsDir)).rejects.toThrow("no space left on device");
    // Nobody will point at a partial file, so it must not stay
    expect(await readdir(path.join(uploadsDir, "avatars"))).toEqual([]);
  });
});
