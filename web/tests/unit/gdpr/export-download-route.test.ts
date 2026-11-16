// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/gdpr/export/[id]/download/route";
import { findExportForDownload } from "@/lib/gdpr/export/find-export-for-download";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

const uploads = vi.hoisted(() => ({ dir: "" }));

// The real ones need NextAuth and the database: these tests only check what the route does with them
vi.mock("@/lib/permissions/require-api-auth", () => ({ requireApiAuth: vi.fn() }));
vi.mock("@/lib/gdpr/export/find-export-for-download", () => ({ findExportForDownload: vi.fn() }));
vi.mock("@/lib/uploads/uploads-dir", () => ({
  get UPLOADS_DIR() {
    return uploads.dir;
  },
}));

const USER = { id: "00000000-0000-0000-0000-000000000001", email: "runner@example.com", nick: "runner", roleGlobal: "user" as const };
const EXPORT_ID = "11111111-1111-4111-8111-111111111111";

function call(id: string, query = "?token=abc"): Promise<Response> {
  return GET(new Request(`http://localhost/api/gdpr/export/${id}/download${query}`), { params: Promise.resolve({ id }) });
}

describe("GET /api/gdpr/export/[id]/download", () => {
  beforeAll(async () => {
    uploads.dir = await mkdtemp(path.join(os.tmpdir(), "export-download-"));
    await mkdir(path.join(uploads.dir, "exports"));
    await writeFile(path.join(uploads.dir, "exports", "a.zip"), "zip-bytes");
  });

  afterAll(async () => {
    await rm(uploads.dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireApiAuth).mockResolvedValue(USER);
  });

  it("answers 401 without a session and does not look the export up", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await call(EXPORT_ID);

    expect(response.status).toBe(401);
    expect(findExportForDownload).not.toHaveBeenCalled();
  });

  it("serves the ZIP as a private download", async () => {
    vi.mocked(findExportForDownload).mockResolvedValue("exports/a.zip");

    const response = await call(EXPORT_ID);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("zip-bytes");
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // The user id comes from the session
    expect(findExportForDownload).toHaveBeenCalledWith(USER.id, EXPORT_ID, "abc");
  });

  it("answers 404 when the lookup finds nothing (wrong token, not theirs, expired)", async () => {
    vi.mocked(findExportForDownload).mockResolvedValue(null);

    expect((await call(EXPORT_ID)).status).toBe(404);
  });

  it("answers 404 without a token or with an empty one, without touching the database", async () => {
    expect((await call(EXPORT_ID, "")).status).toBe(404);
    expect((await call(EXPORT_ID, "?token=")).status).toBe(404);
    expect(findExportForDownload).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that is not a UUID, without touching the database", async () => {
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(findExportForDownload).not.toHaveBeenCalled();
  });

  it("answers 404 when the row exists but its file is gone", async () => {
    vi.mocked(findExportForDownload).mockResolvedValue("exports/missing.zip");

    expect((await call(EXPORT_ID)).status).toBe(404);
  });
});
