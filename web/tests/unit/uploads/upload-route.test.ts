// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/upload/route";
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
  removeAvatar: vi.fn(),
}));

vi.mock("@/lib/uploads/remove-avatar", () => ({
  removeAvatar: fake.removeAvatar,
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

// A real one-colour PNG for the tests that get as far as sharp: PNG_BYTES is only a
// signature, enough for the tests that reject the upload before decoding it.
// 4 channels for an alpha channel. A copy in a plain ArrayBuffer, which is what File takes.
async function pngOf(
  width: number,
  height: number,
  background: string | { r: number; g: number; b: number; alpha: number } = "#00ff00",
  channels: 3 | 4 = 3,
): Promise<Uint8Array<ArrayBuffer>> {
  const image = await sharp({ create: { width, height, channels, background } }).png().toBuffer();
  return new Uint8Array(image);
}

// Planted in the XMP packet, so the test can look for it in the saved bytes
const XMP_SECRET = "planted-xmp-secret";
const XMP_PACKET =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="${XMP_SECRET}"/></rdf:RDF></x:xmpmeta>`;

// Like a phone photo: GPS coordinates in its EXIF, plus an XMP packet
async function photoWithMetadata(format: "jpeg" | "png" | "webp"): Promise<Uint8Array<ArrayBuffer>> {
  const image = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#ff0000" } })
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 25/1 0/1" } })
    .withXmp(XMP_PACKET)
    .toFormat(format)
    .toBuffer();
  // A copy in a plain ArrayBuffer, which is what File takes
  return new Uint8Array(image);
}

// A raw byte search that does not use sharp, so sharp is not the only one checking sharp
function hasBytes(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(text, 0, "latin1");
}

// What the route wrote to disk for the avatar it recorded
async function savedFile(): Promise<Buffer> {
  const record = fake.avatarCreate.mock.calls[0][0].data;
  return readFile(path.join(fake.uploadsDir, record.path));
}

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

  it("saves the image as WebP, records it and points User.image at it", async () => {
    const response = await POST(uploadRequest(formWithFile(await pngOf(2, 2), "a.png", "image/png")));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: AVATAR_ID, url: `/api/files/${AVATAR_ID}` });

    // The row describes the stored file, not the upload: always a new WebP (#223)
    const record = fake.avatarCreate.mock.calls[0][0].data;
    const saved = await savedFile();
    expect(record).toMatchObject({ ownerId: testUser.id, mimeType: "image/webp", sizeBytes: saved.length });
    expect(record.path).toMatch(/^avatars\/.+\.webp$/);
    expect((await sharp(saved).metadata()).format).toBe("webp");

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

    const response = await POST(uploadRequest(formWithFile(await pngOf(2, 2), "a.png", "image/png")));
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

    await expect(POST(uploadRequest(formWithFile(await pngOf(2, 2), "a.png", "image/png")))).rejects.toThrow(
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

    await expect(POST(uploadRequest(formWithFile(await pngOf(2, 2), "a.png", "image/png")))).rejects.toThrow(
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

    const response = await POST(uploadRequest(formWithFile(await pngOf(2, 2), "a.png", "image/png")));

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

    await expect(POST(uploadRequest(formWithFile(await pngOf(2, 2), "a.png", "image/png")))).rejects.toThrow(
      "database down",
    );
    // The orphan is reported, so someone can find it
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

// #223: the saved file is a new image, never the bytes that arrived
describe("POST /api/upload: the saved image", () => {
  // Each format keeps EXIF and XMP in its own block, with its own name. In PNG the XMP
  // text can be compressed (iTXt), so its marker is the block's keyword, never compressed.
  it.each([
    { format: "jpeg", type: "image/jpeg", exifMarker: "Exif", xmpMarker: XMP_SECRET },
    { format: "png", type: "image/png", exifMarker: "eXIf", xmpMarker: "XML:com.adobe.xmp" },
    { format: "webp", type: "image/webp", exifMarker: "EXIF", xmpMarker: "XMP " },
  ] as const)("saves a $format photo as WebP without its EXIF (GPS) or XMP", async (photoCase) => {
    const photo = await photoWithMetadata(photoCase.format);
    // The input really carries what must go: without this the test could pass on nothing
    const input = await sharp(photo).metadata();
    expect(input.exif).toBeDefined();
    expect(input.xmp).toBeDefined();
    expect(hasBytes(photo, photoCase.exifMarker)).toBe(true);
    expect(hasBytes(photo, photoCase.xmpMarker)).toBe(true);

    const response = await POST(uploadRequest(formWithFile(photo, `photo.${photoCase.format}`, photoCase.type)));
    expect(response.status).toBe(201);

    const saved = await savedFile();
    const output = await sharp(saved).metadata();
    expect(output.format).toBe("webp");
    expect(output.exif).toBeUndefined();
    expect(output.xmp).toBeUndefined();
    for (const marker of ["Exif", "EXIF", "eXIf", "XMP ", "XML:com.adobe.xmp", "xmpmeta", XMP_SECRET]) {
      expect(hasBytes(saved, marker), marker).toBe(false);
    }
  });

  it("turns the photo upright before dropping its EXIF orientation", async () => {
    // Orientation 6: the phone was held upright, so the 200 × 100 pixels show a 100 × 200 photo
    const sideways = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#0000ff" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(sideways).metadata()).orientation).toBe(6);

    const response = await POST(uploadRequest(formWithFile(new Uint8Array(sideways), "photo.jpg", "image/jpeg")));
    expect(response.status).toBe(201);

    // Without the tag, nothing would turn it later: the pixels themselves must be upright
    const output = await sharp(await savedFile()).metadata();
    expect({ width: output.width, height: output.height }).toEqual({ width: 100, height: 200 });
    expect(output.orientation).toBeUndefined();
  });

  // At most 512 × 512 (avatars show at 64 px at most), same proportions, never enlarged
  it.each([
    { input: { width: 1024, height: 512 }, saved: { width: 512, height: 256 } },
    { input: { width: 300, height: 200 }, saved: { width: 300, height: 200 } },
  ])("saves a $input.width × $input.height image as $saved.width × $saved.height", async ({ input, saved }) => {
    const image = await pngOf(input.width, input.height);

    const response = await POST(uploadRequest(formWithFile(image, "a.png", "image/png")));
    expect(response.status).toBe(201);

    const output = await sharp(await savedFile()).metadata();
    expect({ width: output.width, height: output.height }).toEqual(saved);
  });

  // The side tests use one row of pixels: tiny files, whatever the length of the other side
  it("accepts an image 8000 px wide, the largest side allowed", async () => {
    const response = await POST(uploadRequest(formWithFile(await pngOf(8000, 1), "a.png", "image/png")));
    expect(response.status).toBe(201);
  });

  // Both sides: a check on the width alone would let a tall image through
  it.each([
    { width: 8001, height: 1 },
    { width: 1, height: 8001 },
  ])("rejects a $width × $height image with 413 and stores nothing", async ({ width, height }) => {
    const response = await POST(uploadRequest(formWithFile(await pngOf(width, height), "a.png", "image/png")));

    expect(response.status).toBe(413);
    // Not "File too large": that one is the 2 MB limit, and this file is a few bytes
    expect(await response.json()).toEqual({ error: "Image too large" });
    expect(await readdir(fake.uploadsDir)).toEqual([]);
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it("rejects an 8001 × 8001 image with 413 and stores nothing, though it is far under 2 MB", async () => {
    // One colour compresses to about 200 KB. Its area is over sharp's pixel limit, which
    // already applies when reading the header: the side check must still get to see it.
    const image = await pngOf(8001, 8001);
    expect(image.length).toBeLessThan(2 * 1024 * 1024);

    const response = await POST(uploadRequest(formWithFile(image, "a.png", "image/png")));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Image too large" });
    expect(await readdir(fake.uploadsDir)).toEqual([]);
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it("rejects with 415 an image that starts like a PNG but cannot be decoded, and stores nothing", async () => {
    // The signature gets it past checkImage; what follows is not a PNG at all
    const broken = new Uint8Array([...PNG_BYTES.subarray(0, 8), ...new TextEncoder().encode("not really a png")]);

    const response = await POST(uploadRequest(formWithFile(broken, "a.png", "image/png")));

    // The same answer as any other file that is not a PNG, JPEG or WebP image
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Unsupported image type" });
    expect(await readdir(fake.uploadsDir)).toEqual([]);
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it("keeps a transparent PNG transparent", async () => {
    const transparent = await pngOf(2, 2, { r: 0, g: 0, b: 0, alpha: 0 }, 4);

    const response = await POST(uploadRequest(formWithFile(transparent, "logo.png", "image/png")));
    expect(response.status).toBe(201);

    const saved = sharp(await savedFile());
    expect((await saved.metadata()).hasAlpha).toBe(true);
    // An alpha channel that is all 255 would show as opaque: look at a pixel. In RGBA,
    // byte 3 is the first pixel's alpha.
    const pixels = await saved.ensureAlpha().raw().toBuffer();
    expect(pixels[3]).toBe(0);
  });

  it("saves only the first frame of an animated WebP", async () => {
    // Two 10 × 10 frames, red then blue (create's pageHeight alone gives a still image)
    const frames = [await pngOf(10, 10, "#ff0000"), await pngOf(10, 10, "#0000ff")];
    const animated = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);

    const response = await POST(uploadRequest(formWithFile(new Uint8Array(animated), "a.webp", "image/webp")));
    expect(response.status).toBe(201);

    // A still image has no pages field. 10 × 20 would mean both frames glued in a strip.
    const saved = sharp(await savedFile());
    const output = await saved.metadata();
    expect(output.pages ?? 1).toBe(1);
    expect({ width: output.width, height: output.height }).toEqual({ width: 10, height: 10 });
    // Red, so the first frame. Lossy WebP shifts colours a little: ranges, not exact values.
    const [red, , blue] = await saved.raw().toBuffer();
    expect(red).toBeGreaterThan(200);
    expect(blue).toBeLessThan(50);
  });
});

describe("DELETE /api/upload", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await DELETE();
    expect(response.status).toBe(401);
    expect(fake.removeAvatar).not.toHaveBeenCalled();
  });

  it("removes the avatar and returns 200 with result", async () => {
    fake.removeAvatar.mockResolvedValue({ removed: true });
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true });
    expect(fake.removeAvatar).toHaveBeenCalledWith(testUser.id);
  });
});
