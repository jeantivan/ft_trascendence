import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyOtp } from "@/lib/gdpr/otp";
import { requestDeleteCode } from "@/lib/gdpr/request-delete-code";
import type { MailMessage, MailSender } from "@/lib/mail/mail-sender";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "runner@42.com" };
const NOW = new Date("2026-11-06T10:00:00Z");

class FakeMailSender implements MailSender {
  sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

class FailingMailSender implements MailSender {
  async send(): Promise<void> {
    throw new Error("connect ECONNREFUSED 10.0.0.1:1025");
  }
}

function codeIn(message: MailMessage): string {
  const match = message.text.match(/Tu código de confirmación es: (\d{6})/);
  if (!match) throw new Error("test setup: no code in the email");
  return match[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestDeleteCode", () => {
  it("emails the session user a delete_account code with the agreed text", async () => {
    const mailer = new FakeMailSender();

    const result = await requestDeleteCode(USER, new InMemoryOtpRepository(), mailer, NOW);

    expect(result).toEqual({ sent: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("runner@42.com");
    expect(mailer.sent[0].subject).toBe("Código para borrar tu cuenta de StrideSync");
    expect(mailer.sent[0].text).toBe(
      [
        "Has solicitado borrar tu cuenta de StrideSync.",
        "",
        `Tu código de confirmación es: ${codeIn(mailer.sent[0])}`,
        "",
        "Caduca en 10 minutos. Solicitar este código no borra tu cuenta: tendrás que introducirlo y confirmar el borrado.",
        "",
        "Si no lo has solicitado, no utilices el código.",
      ].join("\n"),
    );
  });

  it("emails a code that is valid for delete_account", async () => {
    const repo = new InMemoryOtpRepository();
    const mailer = new FakeMailSender();

    await requestDeleteCode(USER, repo, mailer, NOW);

    expect(await verifyOtp(USER.id, "delete_account", codeIn(mailer.sent[0]), repo, NOW)).toEqual({ success: true });
  });

  it("does not put the code in the result", async () => {
    const mailer = new FakeMailSender();

    const result = await requestDeleteCode(USER, new InMemoryOtpRepository(), mailer, NOW);

    expect(JSON.stringify(result)).not.toContain(codeIn(mailer.sent[0]));
  });

  it("refuses inside the cooldown, says how long is left and sends nothing", async () => {
    const repo = new InMemoryOtpRepository();
    const mailer = new FakeMailSender();
    await requestDeleteCode(USER, repo, mailer, NOW);

    const second = await requestDeleteCode(USER, repo, mailer, new Date(NOW.getTime() + 20_000));

    expect(second).toEqual({ sent: false, reason: "cooldown", retryAfterSeconds: 40 });
    expect(mailer.sent).toHaveLength(1);
  });

  it("returns send_failed, not success, when the mail cannot be sent", async () => {
    const result = await requestDeleteCode(USER, new InMemoryOtpRepository(), new FailingMailSender(), NOW);

    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });

  it("keeps the cooldown after a failed send", async () => {
    const repo = new InMemoryOtpRepository();
    await requestDeleteCode(USER, repo, new FailingMailSender(), NOW);

    const retry = await requestDeleteCode(USER, repo, new FakeMailSender(), new Date(NOW.getTime() + 10_000));

    expect(retry).toEqual({ sent: false, reason: "cooldown", retryAfterSeconds: 50 });
  });

  it("does not leak the transport error in the result", async () => {
    const result = await requestDeleteCode(USER, new InMemoryOtpRepository(), new FailingMailSender(), NOW);

    expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
  });

  it("does not rethrow-hide errors that are not the mail send", async () => {
    class BrokenRepository extends InMemoryOtpRepository {
      async findLatest(): Promise<never> {
        throw new Error("database down");
      }
    }

    await expect(requestDeleteCode(USER, new BrokenRepository(), new FakeMailSender(), NOW)).rejects.toThrow(
      "database down",
    );
  });

  it("logs nothing, not even when the send fails", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    await requestDeleteCode(USER, new InMemoryOtpRepository(), new FakeMailSender(), NOW);
    await requestDeleteCode(
      { ...USER, id: "22222222-2222-4222-8222-222222222222" },
      new InMemoryOtpRepository(),
      new FailingMailSender(),
      NOW,
    );

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
