import { describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { verifyOtp } from "@/lib/gdpr/otp";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

// Own file on purpose: the dummy hash is cached per module, and each test file
// gets a fresh module, so here the cache starts empty and the first hash can fail
vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("rejectInvalid: hash falso en caché", () => {
  it("se recupera si el primer hash falla", async () => {
    const repo = new InMemoryOtpRepository();
    vi.mocked(hashPassword).mockRejectedValueOnce(new Error("out of memory"));

    // No code exists for this user, so this goes straight to rejectInvalid
    await expect(verifyOtp(USER_ID, "delete_account", "123456", repo)).rejects.toThrow("out of memory");

    // The failure must not stay cached: the next rejection works normally
    const result = await verifyOtp(USER_ID, "delete_account", "123456", repo);
    expect(result).toEqual({ success: false, reason: "invalid" });
  });
});
