// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/gdpr/export/[id]/route";
import { getExportStatus } from "@/lib/gdpr/export/get-export-status";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// The real ones need NextAuth and the database: these tests only check what the route does with them
vi.mock("@/lib/permissions/require-api-auth", () => ({ requireApiAuth: vi.fn() }));
vi.mock("@/lib/gdpr/export/get-export-status", () => ({ getExportStatus: vi.fn() }));

const USER = { id: "00000000-0000-0000-0000-000000000001", email: "runner@example.com", nick: "runner", roleGlobal: "user" as const };
const EXPORT_ID = "11111111-1111-4111-8111-111111111111";

function call(id: string): Promise<Response> {
  return GET(new Request(`http://localhost/api/gdpr/export/${id}`), { params: Promise.resolve({ id }) });
}

describe("GET /api/gdpr/export/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireApiAuth).mockResolvedValue(USER);
  });

  it("answers 401 without a session and does not look the export up", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await call(EXPORT_ID);

    expect(response.status).toBe(401);
    expect(getExportStatus).not.toHaveBeenCalled();
  });

  it("answers 200 with the status and expiry of the user's own export", async () => {
    const expiresAt = new Date("2026-11-23T10:00:00.000Z");
    vi.mocked(getExportStatus).mockResolvedValue({ status: "ready", expiresAt });

    const response = await call(EXPORT_ID);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", expires_at: "2026-11-23T10:00:00.000Z" });
    // The user id comes from the session
    expect(getExportStatus).toHaveBeenCalledWith(USER.id, EXPORT_ID);
  });

  it("answers expires_at null while the export is pending", async () => {
    vi.mocked(getExportStatus).mockResolvedValue({ status: "pending", expiresAt: null });

    const response = await call(EXPORT_ID);

    expect(await response.json()).toEqual({ status: "pending", expires_at: null });
  });

  it("answers 404 when the export is not the user's or does not exist", async () => {
    vi.mocked(getExportStatus).mockResolvedValue(null);

    const response = await call(EXPORT_ID);

    expect(response.status).toBe(404);
  });

  it("answers 404 for an id that is not a UUID, without touching the database", async () => {
    const response = await call("not-a-uuid");

    expect(response.status).toBe(404);
    expect(getExportStatus).not.toHaveBeenCalled();
  });
});
