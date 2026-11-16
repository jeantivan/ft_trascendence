// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/gdpr/export/route";
import { generateExport } from "@/lib/gdpr/export/generate-export";
import { requestExport } from "@/lib/gdpr/export/request-export";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// The real ones need NextAuth and the database: these tests only check what the route does with them
vi.mock("@/lib/permissions/require-api-auth", () => ({ requireApiAuth: vi.fn() }));
vi.mock("@/lib/gdpr/export/request-export", () => ({ requestExport: vi.fn() }));
vi.mock("@/lib/gdpr/export/generate-export", () => ({ generateExport: vi.fn() }));
// after() only works inside a real request: keep its callbacks to run them by hand
const afterCallbacks = vi.hoisted(() => [] as Array<() => Promise<void> | void>);
vi.mock("next/server", () => ({ after: (callback: () => Promise<void> | void) => afterCallbacks.push(callback) }));

const USER = { id: "00000000-0000-0000-0000-000000000001", email: "runner@example.com", nick: "runner", roleGlobal: "user" as const };

function exportRequest(body: unknown): Request {
  return new Request("http://localhost/api/gdpr/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/gdpr/export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    afterCallbacks.length = 0;
    vi.mocked(requireApiAuth).mockResolvedValue(USER);
  });

  it("answers 401 without a session and does not touch the export", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(exportRequest({ otp: "123456" }));

    expect(response.status).toBe(401);
    expect(requestExport).not.toHaveBeenCalled();
  });

  it("answers 202 with the export id and starts the generation after the response", async () => {
    vi.mocked(requestExport).mockResolvedValue({ requested: true, exportId: "export-1" });

    const response = await POST(exportRequest({ otp: "123456" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ export_id: "export-1", status: "pending" });
    expect(requestExport).toHaveBeenCalledWith(USER.id, "123456");
    // Not before the response: the user must not wait for the ZIP
    expect(generateExport).not.toHaveBeenCalled();
    await afterCallbacks[0]();
    expect(generateExport).toHaveBeenCalledWith("export-1");
  });

  it("answers 403 for a wrong, expired or exhausted code and generates nothing", async () => {
    vi.mocked(requestExport).mockResolvedValue({ requested: false, reason: "invalid_code" });

    const response = await POST(exportRequest({ otp: "000000" }));

    expect(response.status).toBe(403);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("answers 409 when an export is already active", async () => {
    vi.mocked(requestExport).mockResolvedValue({ requested: false, reason: "already_active" });

    const response = await POST(exportRequest({ otp: "123456" }));

    expect(response.status).toBe(409);
    // Active covers a pending export and a ready one that has not expired
    expect(await response.json()).toEqual({ error: "An export is already active" });
    expect(afterCallbacks).toHaveLength(0);
  });

  it.each([["not json"], [{}], [{ otp: 123456 }], [{ otp: "" }]])("answers 400 for the body %j", async (body) => {
    const response = await POST(exportRequest(body));

    expect(response.status).toBe(400);
    expect(requestExport).not.toHaveBeenCalled();
  });
});
