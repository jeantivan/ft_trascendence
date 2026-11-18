// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/gdpr/export/otp/route";
import { requestExportCode } from "@/lib/gdpr/export/request-export-code";
import { createSmtpMailSender } from "@/lib/mail/smtp-mail-sender";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// The real ones need NextAuth, SMTP and the database: these tests only check what the route does with them
vi.mock("@/lib/permissions/require-api-auth", () => ({ requireApiAuth: vi.fn() }));
vi.mock("@/lib/gdpr/export/request-export-code", () => ({ requestExportCode: vi.fn() }));
vi.mock("@/lib/mail/smtp-mail-sender", () => ({ createSmtpMailSender: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const USER = { id: "00000000-0000-0000-0000-000000000001", email: "runner@example.com", nick: "runner", roleGlobal: "user" as const };

describe("POST /api/gdpr/export/otp", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireApiAuth).mockResolvedValue(USER);
    vi.mocked(createSmtpMailSender).mockReturnValue({ send: vi.fn() } as unknown as ReturnType<typeof createSmtpMailSender>);
  });

  const call = () => POST();

  it("answers 401 without a session and sends nothing", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    expect((await call()).status).toBe(401);
    expect(requestExportCode).not.toHaveBeenCalled();
  });

  it("answers 204 with no body and sends the code to the session user", async () => {
    vi.mocked(requestExportCode).mockResolvedValue({ sent: true });

    const response = await call();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(vi.mocked(requestExportCode).mock.calls[0][0]).toEqual({ id: USER.id, email: USER.email });
  });

  it("answers 429 with Retry-After during the cooldown", async () => {
    vi.mocked(requestExportCode).mockResolvedValue({ sent: false, reason: "cooldown", retryAfterSeconds: 42 });

    const response = await call();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  it("answers 503 when the email could not be sent", async () => {
    vi.mocked(requestExportCode).mockResolvedValue({ sent: false, reason: "send_failed" });

    expect((await call()).status).toBe(503);
  });

  it("answers 503 without issuing a code when the SMTP settings are missing", async () => {
    vi.mocked(createSmtpMailSender).mockImplementation(() => {
      throw new Error("SMTP_HOST missing");
    });

    expect((await call()).status).toBe(503);
    expect(requestExportCode).not.toHaveBeenCalled();
  });
});
