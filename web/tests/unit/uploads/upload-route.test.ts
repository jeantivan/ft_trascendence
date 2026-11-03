// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/upload/route";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// The real requireApiAuth needs NextAuth and the users table: fake it, so these
// tests only check what the route does with the upload.
vi.mock("@/lib/permissions/require-api-auth", () => ({
  requireApiAuth: vi.fn(),
}));

// vi.mock runs before the rest of the file, so what its factories use must be
// created with vi.hoisted, which runs even earlier.
const fake = vi.hoisted(() => ({
  uploadsDir: "",
  avatarCreate: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
  avatarFindMany: vi.fn(),
  avatarDelete: vi.fn(),
}));

// A getter, so the route reads the temporary directory of the current test
vi.mock("@/lib/uploads/uploads-dir", () => ({
  get UPLOADS_DIR() {
    return fake.uploadsDir;
  },
}));

// No database here: the transaction runs the route's callback with a fake client,
// and the old avatars are whatever avatarFindMany returns in each test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: fake.transaction,
    avatar: { findMany: fake.avatarFindMany, delete: fake.avatarDelete },
  },
}));

const AVATAR_ID = "00000000-0000-0000-0000-00000000f001";
const AVATAR_CREATED_AT = new Date("2026-11-03T12:00:00Z");
const OLD_AVATAR = { id: "00000000-0000-0000-0000-00000000f000", path: "avatars/old.png" };

const testUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "runner@example.com",
  nick: "runner",
  roleGlobal: "user" as const,
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

// A multipart POST like the browser sends. contentLength is only what the header
// claims: the route must trust it to reject early, and checkImage checks the real size.
function uploadRequest(form: FormData, contentLength: string | null = "1000"): Request {
  const headers = new Headers();
  if (contentLength !== null) {
    headers.set("content-length", contentLength);
  }
  return new Request("http://localhost/api/upload", { method: "POST", body: form, headers });
}

// File only takes bytes backed by a plain ArrayBuffer, hence <ArrayBuffer>
function formWithFile(bytes: Uint8Array<ArrayBuffer>, name: string, type: string): FormData {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return form;
}

beforeEach(async () => {
  vi.mocked(requireApiAuth).mockResolvedValue(testUser);
  fake.uploadsDir = await mkdtemp(path.join(tmpdir(), "upload-route-test-"));
  fake.avatarCreate.mockReset().mockResolvedValue({ id: AVATAR_ID, createdAt: AVATAR_CREATED_AT });
  fake.userUpdate.mockReset().mockResolvedValue({});
  fake.transaction
    .mockReset()
    .mockImplementation((work) => work({ avatar: { create: fake.avatarCreate }, user: { update: fake.userUpdate } }));
  // By default the user had no avatar before
  fake.avatarFindMany.mockReset().mockResolvedValue([]);
  fake.avatarDelete.mockReset().mockResolvedValue({});
});

afterEach(async () => {
  await rm(fake.uploadsDir, { recursive: true, force: true });
});

describe("POST /api/upload", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")));
    expect(response.status).toBe(401);
  });

  it("returns 411 when the request does not say its size", async () => {
    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png"), null));
    expect(response.status).toBe(411);
  });

  it("returns 413 when the request says it is far over 2 MB, before reading it", async () => {
    const tenMb = String(10 * 1024 * 1024);
    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png"), tenMb));
    expect(response.status).toBe(413);
  });

  it("returns 400 when there is no file field", async () => {
    const form = new FormData();
    form.append("other", "hello");
    const response = await POST(uploadRequest(form));
    expect(response.status).toBe(400);
  });

  it("returns 415 for a text file sent as image/png", async () => {
    // The client lies about the type: only the bytes count
    const text = new TextEncoder().encode("not an image");
    const response = await POST(uploadRequest(formWithFile(text, "a.png", "image/png")));
    expect(response.status).toBe(415);
  });

  it("saves the image, records it and points User.image at it", async () => {
    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: AVATAR_ID, url: `/api/files/${AVATAR_ID}` });

    const record = fake.avatarCreate.mock.calls[0][0].data;
    expect(record).toMatchObject({ ownerId: testUser.id, mimeType: "image/png", sizeBytes: PNG_BYTES.length });
    expect(record.path).toMatch(/^avatars\/.+\.png$/);
    expect(new Uint8Array(await readFile(path.join(fake.uploadsDir, record.path)))).toEqual(PNG_BYTES);

    expect(fake.userUpdate).toHaveBeenCalledWith({
      where: { id: testUser.id },
      data: { image: `/api/files/${AVATAR_ID}` },
    });
  });

  it("deletes the avatars created before the new one, row first and then file", async () => {
    await mkdir(path.join(fake.uploadsDir, "avatars"));
    await writeFile(path.join(fake.uploadsDir, OLD_AVATAR.path), PNG_BYTES);
    fake.avatarFindMany.mockResolvedValue([OLD_AVATAR]);
    // What is on disk when the row is deleted: the old file must still be there
    let filesWhenRowDeleted: string[] = [];
    fake.avatarDelete.mockImplementation(async () => {
      filesWhenRowDeleted = await readdir(path.join(fake.uploadsDir, "avatars"));
      return {};
    });

    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")));
    expect(response.status).toBe(201);

    // Only older ones: a newer avatar belongs to an upload saved later (#23)
    expect(fake.avatarFindMany).toHaveBeenCalledWith({
      where: { ownerId: testUser.id, createdAt: { lt: AVATAR_CREATED_AT } },
      select: { id: true, path: true },
    });
    expect(fake.avatarDelete).toHaveBeenCalledWith({ where: { id: OLD_AVATAR.id } });
    expect(filesWhenRowDeleted).toContain(path.basename(OLD_AVATAR.path));
    // The old file is gone and the new one stays
    const newPath = fake.avatarCreate.mock.calls[0][0].data.path;
    expect(await readdir(path.join(fake.uploadsDir, "avatars"))).toEqual([path.basename(newPath)]);
  });

  it("removes the saved image when the database write fails", async () => {
    fake.transaction.mockRejectedValue(new Error("database down"));

    await expect(POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")))).rejects.toThrow(
      "database down",
    );
    // avatars/ was created for the file, which must be gone
    expect(await readdir(path.join(fake.uploadsDir, "avatars"))).toEqual([]);
  });

  it("keeps the old avatar when the database write fails", async () => {
    fake.avatarFindMany.mockResolvedValue([OLD_AVATAR]);
    fake.transaction.mockRejectedValue(new Error("database down"));

    await expect(POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")))).rejects.toThrow(
      "database down",
    );
    // The user keeps the photo they had (#23)
    expect(fake.avatarFindMany).not.toHaveBeenCalled();
    expect(fake.avatarDelete).not.toHaveBeenCalled();
  });

  it("still answers 201 and logs the id when deleting an old avatar fails", async () => {
    const otherOld = { id: "00000000-0000-0000-0000-00000000f00f", path: "avatars/other.png" };
    // OLD_AVATAR has no file on disk, so its unlink fails with ENOENT; otherOld has one
    await mkdir(path.join(fake.uploadsDir, "avatars"));
    await writeFile(path.join(fake.uploadsDir, otherOld.path), PNG_BYTES);
    fake.avatarFindMany.mockResolvedValue([OLD_AVATAR, otherOld]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")));

    // The new avatar is saved and in use: the failure is only ours to clean up
    expect(response.status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), OLD_AVATAR.id, expect.anything());
    // One failure does not stop the rest
    expect(fake.avatarDelete).toHaveBeenCalledWith({ where: { id: otherOld.id } });
    const newPath = fake.avatarCreate.mock.calls[0][0].data.path;
    expect(await readdir(path.join(fake.uploadsDir, "avatars"))).toEqual([path.basename(newPath)]);
    consoleError.mockRestore();
  });

  it("still reports the database error when removing the saved image fails too", async () => {
    // The file disappears before the cleanup, so unlink fails with ENOENT
    fake.transaction.mockImplementation(async () => {
      await rm(path.join(fake.uploadsDir, "avatars"), { recursive: true });
      throw new Error("database down");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")))).rejects.toThrow(
      "database down",
    );
    // The orphan is reported, so someone can find it
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
