import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/lib/auth/schemas";

describe("Auth Zod schemas", () => {
  describe("loginSchema", () => {
    it("accepts valid email and password", () => {
      const result = loginSchema.safeParse({
        email: "runner@42madrid.com",
        password: "password123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty password", () => {
      const result = loginSchema.safeParse({
        email: "runner@42madrid.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });

    it("normalizes email to lowercase", () => {
      const result = loginSchema.safeParse({
        email: "RUNNER@42Madrid.COM",
        password: "password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("runner@42madrid.com");
      }
    });
  });

  describe("registerSchema", () => {
    it("accepts valid registration input", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "securePassword123!",
        nick: "fastrunner",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 8 characters", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "short",
        nick: "fastrunner",
      });
      expect(result.success).toBe(false);
    });

    it("rejects nick shorter than 2 characters", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "securePassword123!",
        nick: "a",
      });
      expect(result.success).toBe(false);
    });

    it("rejects nick longer than 30 characters", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "securePassword123!",
        nick: "a".repeat(31),
      });
      expect(result.success).toBe(false);
    });

    it("rejects password longer than 72 characters", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "a".repeat(73),
        nick: "fastrunner",
      });
      expect(result.success).toBe(false);
    });

    it("accepts password of exactly 72 bytes with 2-byte characters", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "ñ".repeat(36),
        nick: "fastrunner",
      });
      expect(result.success).toBe(true);
    });

    it("rejects password exceeding 72 bytes even if character count is under 72", () => {
      const result = registerSchema.safeParse({
        email: "newrunner@42madrid.com",
        password: "ñ".repeat(36) + "A",
        nick: "fastrunner",
      });
      expect(result.success).toBe(false);
    });

    it("normalizes email to lowercase", () => {
      const result = registerSchema.safeParse({
        email: "NEWRUNNER@42Madrid.COM",
        password: "securePassword123!",
        nick: "fastrunner",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("newrunner@42madrid.com");
      }
    });
  });
});
