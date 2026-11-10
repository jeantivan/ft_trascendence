import { describe, expect, it } from "vitest";
import {
  updateNickSchema,
  updateEmailSchema,
  updatePasswordSchema,
} from "@/lib/user/schemas";

describe("User settings Zod schemas", () => {
  describe("updateNickSchema", () => {
    it("accepts valid nick and trims whitespace", () => {
      const result = updateNickSchema.safeParse({ nick: "  atleta42  " });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nick).toBe("atleta42");
      }
    });

    it("rejects nick shorter than 2 characters", () => {
      const result = updateNickSchema.safeParse({ nick: "a" });
      expect(result.success).toBe(false);
    });

    it("rejects nick with only whitespace", () => {
      const result = updateNickSchema.safeParse({ nick: "   " });
      expect(result.success).toBe(false);
    });

    it("rejects nick longer than 30 characters", () => {
      const result = updateNickSchema.safeParse({ nick: "a".repeat(31) });
      expect(result.success).toBe(false);
    });
  });

  describe("updateEmailSchema", () => {
    it("accepts valid email and normalizes to lowercase", () => {
      const result = updateEmailSchema.safeParse({
        email: "  ATLETA@42madrid.COM  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("atleta@42madrid.com");
      }
    });

    it("accepts optional currentPassword", () => {
      const result = updateEmailSchema.safeParse({
        email: "atleta@42madrid.com",
        currentPassword: "miPasswordActual123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email format", () => {
      const result = updateEmailSchema.safeParse({
        email: "no-es-un-correo",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updatePasswordSchema", () => {
    it("accepts valid new password", () => {
      const result = updatePasswordSchema.safeParse({
        newPassword: "nuevaPasswordSegura123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional currentPassword", () => {
      const result = updatePasswordSchema.safeParse({
        newPassword: "nuevaPasswordSegura123",
        currentPassword: "antiguaPassword123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects new password shorter than 8 characters", () => {
      const result = updatePasswordSchema.safeParse({
        newPassword: "corta",
      });
      expect(result.success).toBe(false);
    });

    it("rejects new password longer than 72 characters", () => {
      const result = updatePasswordSchema.safeParse({
        newPassword: "a".repeat(73),
      });
      expect(result.success).toBe(false);
    });
  });
});
