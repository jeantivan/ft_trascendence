import { beforeEach, describe, expect, it } from "vitest";
import { issueOtp, verifyOtp } from "@/lib/gdpr/otp";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("verifyOtp", () => {
  let repo: InMemoryOtpRepository;

  beforeEach(() => {
    repo = new InMemoryOtpRepository();
  });

  it("rechaza un código emitido para otro propósito", async () => {
    const code = await issueOtp(USER_ID, "export_data", repo);

    const result = await verifyOtp(USER_ID, "delete_account", code, repo);

    expect(result).toEqual({ success: false, reason: "invalid" });
  });
});
