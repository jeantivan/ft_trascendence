import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("Password hashing and verification", () => {
  it("hashes password and verifies correctly", async () => {
    const rawPassword = "securePassword123!";
    const hash = await hashPassword(rawPassword);

    expect(hash).not.toBe(rawPassword);
    expect(hash).toMatch(/^\$2[abxy]\$/);

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const rawPassword = "securePassword123!";
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword("wrongPassword456!", hash);
    expect(isValid).toBe(false);
  });
});
