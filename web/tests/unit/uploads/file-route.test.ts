// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/files/[id]/route";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { canViewAvatar } from "@/lib/uploads/can-view-avatar";
import { SILHOUETTE_SVG } from "@/lib/uploads/silhouette";

vi.mock("@/lib/permissions/require-api-auth", () => ({
  requireApiAuth: vi.fn(),
}));

// The rule itself is tested in can-view-avatar.test.ts: here only its answer matters
vi.mock("@/lib/uploads/can-view-avatar", () => ({
  canViewAvatar: vi.fn(),
}));

// vi.mock runs before the rest of the file: what its factories use comes from vi.hoisted
const fake = vi.hoisted(() => ({
  uploadsDir: "",
  findUnique: vi.fn(),
}));

vi.mock("@/lib/uploads/uploads-dir", () => ({
  get UPLOADS_DIR() {
    return fake.uploadsDir;
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { avatar: { findUnique: fake.findUnique } },
}));

const viewer = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "viewer@example.com",
  nick: "viewer",
  roleGlobal: "user" as const,
};
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const AVATAR_ID = "00000000-0000-0000-0000-00000000f001";
const PHOTO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const RECORD = { ownerId: OWNER_ID, mimeType: "image/png", path: "avatars/photo.png" };

// Next passes the [id] segment as a Promise of the params
function getFile(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) });
}

async function expectSilhouette(response: Response): Promise<void> {
  // 200, not 404: the answer must not tell whether the photo exists
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/svg+xml");
  expect(response.headers.get("cache-control")).toBe("private");
  expect(await response.text()).toBe(SILHOUETTE_SVG);
}

beforeEach(async () => {
  vi.mocked(requireApiAuth).mockResolvedValue(viewer);
  vi.mocked(canViewAvatar).mockReset().mockResolvedValue(true);
  fake.findUnique.mockReset().mockResolvedValue(RECORD);
  fake.uploadsDir = await mkdtemp(path.join(tmpdir(), "file-route-test-"));
  await mkdir(path.join(fake.uploadsDir, "avatars"));
  await writeFile(path.join(fake.uploadsDir, RECORD.path), PHOTO);
});

afterEach(async () => {
  await rm(fake.uploadsDir, { recursive: true, force: true });
});

describe("GET /api/files/[id]", () => {
  it("returns the photo with its type when the viewer may see it", async () => {
    const response = await getFile(AVATAR_ID);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PHOTO);
    expect(canViewAvatar).toHaveBeenCalledWith(viewer, OWNER_ID);
  });

  it("returns the silhouette when the viewer may not see it", async () => {
    vi.mocked(canViewAvatar).mockResolvedValue(false);
    await expectSilhouette(await getFile(AVATAR_ID));
  });

  it("returns the silhouette for an unknown id", async () => {
    fake.findUnique.mockResolvedValue(null);
    await expectSilhouette(await getFile(AVATAR_ID));
    expect(canViewAvatar).not.toHaveBeenCalled();
  });

  it("returns the silhouette for an id that is not a UUID, without asking the database", async () => {
    // Prisma throws on a malformed uuid: it must never get there
    await expectSilhouette(await getFile("not-a-uuid"));
    await expectSilhouette(await getFile("..%2F..%2Fetc%2Fpasswd"));
    expect(fake.findUnique).not.toHaveBeenCalled();
  });

  it("returns the 401 of requireApiAuth without a session, like the rest of the API (#46)", async () => {
    const unauthorized = Response.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(requireApiAuth).mockResolvedValue(unauthorized);
    const response = await getFile(AVATAR_ID);
    expect(response).toBe(unauthorized);
    expect(response.status).toBe(401);
    expect(fake.findUnique).not.toHaveBeenCalled();
  });

  it("returns the silhouette when the row exists but the file is missing on disk", async () => {
    await rm(path.join(fake.uploadsDir, RECORD.path));
    await expectSilhouette(await getFile(AVATAR_ID));
  });
});
