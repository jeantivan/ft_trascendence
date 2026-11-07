import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDeleteCodeAction } from "@/lib/gdpr/actions";
import { requestDeleteCode } from "@/lib/gdpr/request-delete-code";
import { createSmtpMailSender } from "@/lib/mail/smtp-mail-sender";
import { requireAuth } from "@/lib/permissions/require-auth";

vi.mock("@/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/permissions/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/gdpr/delete-account", () => ({ deleteAccountWithOtp: vi.fn() }));
vi.mock("@/lib/gdpr/request-delete-code", () => ({ requestDeleteCode: vi.fn() }));
vi.mock("@/lib/mail/smtp-mail-sender", () => ({ createSmtpMailSender: vi.fn() }));

// next/navigation's redirect() ends by throwing
class RedirectSignal extends Error {}

const SESSION_USER = { id: "user-from-session", email: "session@42.com", nick: "Uno", roleGlobal: "user" as const };
const MAILER = { send: vi.fn() };

describe("requestDeleteCodeAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION_USER);
    vi.mocked(createSmtpMailSender).mockReturnValue(MAILER as never);
  });

  it("requests the code for the session user and the SMTP sender", async () => {
    vi.mocked(requestDeleteCode).mockResolvedValue({ sent: true });

    const result = await requestDeleteCodeAction();

    expect(result).toEqual({ success: true });
    expect(requestDeleteCode).toHaveBeenCalledTimes(1);
    const [user, , mailer] = vi.mocked(requestDeleteCode).mock.calls[0];
    expect(user).toEqual(SESSION_USER);
    expect(mailer).toBe(MAILER);
  });

  it("stops before sending anything when requireAuth redirects", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RedirectSignal());

    await expect(requestDeleteCodeAction()).rejects.toBeInstanceOf(RedirectSignal);

    expect(createSmtpMailSender).not.toHaveBeenCalled();
    expect(requestDeleteCode).not.toHaveBeenCalled();
  });

  it("returns a generic error, without details, when the SMTP settings are wrong", async () => {
    vi.mocked(createSmtpMailSender).mockImplementation(() => {
      throw new Error("SMTP_HOST, SMTP_PORT and MAIL_FROM must be set to send email");
    });

    const result = await requestDeleteCodeAction();

    expect(result).toEqual({ success: false, error: "No se pudo enviar el código. Inténtalo más tarde." });
    expect(requestDeleteCode).not.toHaveBeenCalled();
  });

  it("tells the user to wait a minute when the send fails, without technical details", async () => {
    vi.mocked(requestDeleteCode).mockResolvedValue({ sent: false, reason: "send_failed" });

    const result = await requestDeleteCodeAction();

    expect(result).toEqual({
      success: false,
      error: "No se pudo enviar el código. Espera un minuto antes de reintentarlo.",
      retryAfterSeconds: 60,
    });
  });

  it("returns how long is left when the cooldown is running", async () => {
    vi.mocked(requestDeleteCode).mockResolvedValue({ sent: false, reason: "cooldown", retryAfterSeconds: 42 });

    const result = await requestDeleteCodeAction();

    expect(result).toEqual({
      success: false,
      error: "Ya se envió un código hace poco. Espera antes de pedir otro.",
      retryAfterSeconds: 42,
    });
  });

  it("does not turn an unexpected error into a result", async () => {
    vi.mocked(requestDeleteCode).mockRejectedValue(new Error("database down"));

    await expect(requestDeleteCodeAction()).rejects.toThrow("database down");
  });
});
