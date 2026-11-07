import { describe, expect, it, vi } from "vitest";
import { createSmtpMailSender, SmtpMailSender } from "@/lib/mail/smtp-mail-sender";

const MESSAGE = { to: "runner@42.com", subject: "Tu código", text: "Código: 123456" };

describe("SmtpMailSender", () => {
  it("hands the message to the transport with the configured sender", async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({}) };

    await new SmtpMailSender(transport, "StrideSync <no-reply@stridesync.local>").send(MESSAGE);

    expect(transport.sendMail).toHaveBeenCalledWith({
      from: "StrideSync <no-reply@stridesync.local>",
      to: "runner@42.com",
      subject: "Tu código",
      text: "Código: 123456",
    });
  });

  it("rejects when the transport fails", async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")) };

    await expect(new SmtpMailSender(transport, "a@b.c").send(MESSAGE)).rejects.toThrow("ECONNREFUSED");
  });
});

describe("createSmtpMailSender", () => {
  it("builds a sender from valid settings", () => {
    const env = { SMTP_HOST: "mailpit", SMTP_PORT: "1025", MAIL_FROM: "no-reply@stridesync.local" };

    expect(createSmtpMailSender(env)).toBeInstanceOf(SmtpMailSender);
  });

  it.each([
    ["host", { SMTP_PORT: "1025", MAIL_FROM: "a@b.c" }],
    ["port", { SMTP_HOST: "mailpit", MAIL_FROM: "a@b.c" }],
    ["sender", { SMTP_HOST: "mailpit", SMTP_PORT: "1025" }],
  ])("throws when the %s is missing", (_label, env) => {
    expect(() => createSmtpMailSender(env)).toThrow("must be set");
  });

  it.each(["abc", "0x19", "25.5", "-1", "0", "65536", ""])("throws on the invalid port %j", (port) => {
    const env = { SMTP_HOST: "mailpit", SMTP_PORT: port, MAIL_FROM: "a@b.c" };

    expect(() => createSmtpMailSender(env)).toThrow();
  });
});
