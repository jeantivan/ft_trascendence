import { describe, expect, it } from "vitest";
import { requestExportCode } from "@/lib/gdpr/export/request-export-code";
import { verifyOtp } from "@/lib/gdpr/otp";
import type { MailMessage, MailSender } from "@/lib/mail/mail-sender";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "runner@42.com" };
const NOW = new Date("2026-11-15T10:00:00Z");

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
  const match = message.text.match(/Tu código es: (\d{6})/);
  if (!match) throw new Error("test setup: no code in the email");
  return match[1];
}

describe("requestExportCode", () => {
  it("emails the session user an export_data code, and only that purpose accepts it", async () => {
    const repo = new InMemoryOtpRepository();
    const mailer = new FakeMailSender();

    const result = await requestExportCode(USER, repo, mailer, NOW);

    expect(result).toEqual({ sent: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("runner@42.com");
    expect(mailer.sent[0].subject).toBe("Código para exportar tus datos de StrideSync");
    const code = codeIn(mailer.sent[0]);
    expect((await verifyOtp(USER.id, "delete_account", code, repo, NOW)).success).toBe(false);
    expect((await verifyOtp(USER.id, "export_data", code, repo, NOW)).success).toBe(true);
  });

  it("does not send a second code during the cooldown", async () => {
    const repo = new InMemoryOtpRepository();
    const mailer = new FakeMailSender();
    await requestExportCode(USER, repo, mailer, NOW);

    const result = await requestExportCode(USER, repo, mailer, new Date(NOW.getTime() + 10_000));

    expect(result).toEqual({ sent: false, reason: "cooldown", retryAfterSeconds: 50 });
    expect(mailer.sent).toHaveLength(1);
  });

  it("reports send_failed without leaking the mail error or the code", async () => {
    const result = await requestExportCode(USER, new InMemoryOtpRepository(), new FailingMailSender(), NOW);

    expect(result).toEqual({ sent: false, reason: "send_failed" });
  });
});
