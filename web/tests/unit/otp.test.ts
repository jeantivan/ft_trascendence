import { beforeEach, describe, expect, it } from "vitest";
import { issueOtp, verifyOtp } from "@/lib/gdpr/otp";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("verifyOtp", () => {
  let repo: InMemoryOtpRepository;

  beforeEach(() => {
    repo = new InMemoryOtpRepository();
  });

  it("acepta un código con el propósito correcto", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);

    const result = await verifyOtp(USER_ID, "delete_account", code, repo);

    expect(result).toEqual({ success: true });
  });

  it("rechaza un código emitido para otro propósito", async () => {
    const code = await issueOtp(USER_ID, "export_data", repo);

    const result = await verifyOtp(USER_ID, "delete_account", code, repo);

    expect(result).toEqual({ success: false, reason: "invalid" });
  });

  it("rechaza un código pasados 10 minutos", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);

    const tenMinutesAndOneSecond = new Date(issuedAt.getTime() + 10 * 60 * 1000 + 1000);
    const result = await verifyOtp(USER_ID, "delete_account", code, repo, tenMinutesAndOneSecond);

    expect(result).toEqual({ success: false, reason: "invalid" });
  });

  it("acepta un código un milisegundo antes de expirar", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);

    const justBefore = new Date(issuedAt.getTime() + 10 * 60 * 1000 - 1);
    const result = await verifyOtp(USER_ID, "delete_account", code, repo, justBefore);

    expect(result).toEqual({ success: true });
  });

  it("rechaza un código exactamente en el instante de expirar", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);

    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const result = await verifyOtp(USER_ID, "delete_account", code, repo, expiresAt);

    expect(result).toEqual({ success: false, reason: "invalid" });
  });
});
