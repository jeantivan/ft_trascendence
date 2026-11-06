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
  avatarDeleteMany: vi.fn(),
}));

// A getter, so the route reads the temporary directory of the current test
vi.mock("@/lib/uploads/uploads-dir", () => ({
  get UPLOADS_DIR() {
    return fake.uploadsDir;
  },
}));

// No database here: the transaction runs the route's callback with a fake client,
// and the user's other avatars are whatever avatarFindMany returns in each test
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: fake.transaction },
}));

const AVATAR_ID = "00000000-0000-0000-0000-00000000f001";
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

// The client the route's transaction callback receives
function fakeTx() {
  return {
    avatar: { create: fake.avatarCreate, findMany: fake.avatarFindMany, deleteMany: fake.avatarDeleteMany },
    user: { update: fake.userUpdate },
  };
}

beforeEach(async () => {
  vi.mocked(requireApiAuth).mockResolvedValue(testUser);
  fake.uploadsDir = await mkdtemp(path.join(tmpdir(), "upload-route-test-"));
  fake.avatarCreate.mockReset().mockResolvedValue({ id: AVATAR_ID });
  fake.userUpdate.mockReset().mockResolvedValue({});
  fake.transaction.mockReset().mockImplementation((work) => work(fakeTx()));
  // By default the user had no avatar before
  fake.avatarFindMany.mockReset().mockResolvedValue([]);
  fake.avatarDeleteMany.mockReset().mockResolvedValue({ count: 0 });
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

  // Number("abc") is NaN, and NaN > limit is false: without a check it would pass
  it("returns 400 when the declared size is not a number", async () => {
    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png"), "abc"));
    expect(response.status).toBe(400);
  });

  it("returns 400 when the declared size is negative", async () => {
    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png"), "-1"));
    expect(response.status).toBe(400);
  });

  it("returns 400 when the declared size is not only digits, as HTTP requires", async () => {
    // Number() would accept all of these as a valid size
    for (const contentLength of ["0x10", "1e3", "1.5", "-0"]) {
      const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png"), contentLength));
      expect(response.status, contentLength).toBe(400);
    }
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

  it("returns 415 when the body is not multipart form data", async () => {
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: JSON.stringify({ file: "a.png" }),
      headers: { "content-type": "application/json", "content-length": "1000" },
    });
    const response = await POST(request);
    expect(response.status).toBe(415);
  });

  it("returns 415 for a media type that only starts like multipart/form-data", async () => {
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: "x",
      headers: { "content-type": "multipart/form-datax; boundary=xyz", "content-length": "1" },
    });
    const response = await POST(request);
    expect(response.status).toBe(415);
  });

  it("rethrows a failure while reading the body that is not a parse error", async () => {
    const request = uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png"));
    // Not the client's fault: it must reach the logs as a 500, not hide as a 400
    vi.spyOn(request, "formData").mockRejectedValue(new Error("out of memory"));
    await expect(POST(request)).rejects.toThrow("out of memory");
  });

  it("returns 400 when the multipart body is broken", async () => {
    // Says multipart, but the body is cut off: no closing boundary
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: "--xyz\r\nContent-Disposition: form-data; name=\"file\"",
      headers: { "content-type": "multipart/form-data; boundary=xyz", "content-length": "1000" },
    });
    const response = await POST(request);
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
    // No old avatars: no DELETE while the user's row is locked
    expect(fake.avatarDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes the user's other avatars in the same transaction, after pointing User.image at the new one", async () => {
    await mkdir(path.join(fake.uploadsDir, "avatars"));
    await writeFile(path.join(fake.uploadsDir, OLD_AVATAR.path), PNG_BYTES);
    fake.avatarFindMany.mockResolvedValue([OLD_AVATAR]);
    // What is on disk when the rows are deleted: the old file must still be there
    let filesWhenRowsDeleted: string[] = [];
    fake.avatarDeleteMany.mockImplementation(async () => {
      filesWhenRowsDeleted = await readdir(path.join(fake.uploadsDir, "avatars"));
      return { count: 1 };
    });

    const response = await POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")));
    expect(response.status).toBe(201);

    // Every avatar but the new one, not only older ones: with two uploads at once, the
    // one that commits last is the one User.image points at, so it deletes the other (#23)
    expect(fake.avatarFindMany).toHaveBeenCalledWith({
      where: { ownerId: testUser.id, id: { not: AVATAR_ID } },
      select: { id: true, path: true },
    });
    expect(fake.avatarDeleteMany).toHaveBeenCalledWith({ where: { id: { in: [OLD_AVATAR.id] } } });
    // The wait-then-see-the-other-avatar above needs READ COMMITTED: pinned, not a default
    expect(fake.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
    // After the update, which locks the user's row until commit: a parallel upload
    // waits there, so it sees this avatar once it goes on
    const updateOrder = fake.userUpdate.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(fake.avatarFindMany.mock.invocationCallOrder[0]);
    expect(filesWhenRowsDeleted).toContain(path.basename(OLD_AVATAR.path));
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

  it("keeps the old avatar's file when the commit fails", async () => {
    await mkdir(path.join(fake.uploadsDir, "avatars"));
    await writeFile(path.join(fake.uploadsDir, OLD_AVATAR.path), PNG_BYTES);
    fake.avatarFindMany.mockResolvedValue([OLD_AVATAR]);
    // The worst moment: all the work inside the transaction is done, then the commit fails
    fake.transaction.mockImplementation(async (work) => {
      await work(fakeTx());
      throw new Error("commit failed");
    });

    await expect(POST(uploadRequest(formWithFile(PNG_BYTES, "a.png", "image/png")))).rejects.toThrow(
      "commit failed",
    );
    // The callback did run and found the old avatar...
    expect(fake.avatarDeleteMany).toHaveBeenCalled();
    // ...but the rollback brings its row back, so its file must still be there (#23).
    // The new file is an orphan and is gone.
    expect(await readdir(path.join(fake.uploadsDir, "avatars"))).toEqual([path.basename(OLD_AVATAR.path)]);
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
    // The row is already gone, so the path is what finds the leftover file
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), OLD_AVATAR.id, OLD_AVATAR.path, expect.anything());
    // One failure does not stop the rest: otherOld's file is gone too
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
