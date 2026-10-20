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
  });
});
