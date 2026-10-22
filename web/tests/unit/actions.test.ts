import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loginAction,
  registerAction,
  logoutAction,
} from "@/lib/auth/actions";
import { signIn, signOut } from "@/auth";
import * as registerModule from "@/lib/auth/register";
import { AuthError } from "next-auth";

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

describe("Server Actions - Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loginAction", () => {
    it("successfully invokes signIn with credentials", async () => {
      const formData = new FormData();
      formData.append("email", "runner@42.com");
      formData.append("password", "secret123!");

      const result = await loginAction(null, formData);

      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "runner@42.com",
        password: "secret123!",
        redirectTo: "/dashboard",
      });
      expect(result).toEqual({ success: true });
    });

    it("respects valid callbackUrl when provided", async () => {
      const formData = new FormData();
      formData.append("email", "runner@42.com");
      formData.append("password", "secret123!");
      formData.append("callbackUrl", "/events/running-123");

      const result = await loginAction(null, formData);

      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "runner@42.com",
        password: "secret123!",
        redirectTo: "/events/running-123",
      });
      expect(result).toEqual({ success: true });
    });

    it("sanitizes open-redirect attempts falling back to /dashboard", async () => {
      const formData = new FormData();
      formData.append("email", "runner@42.com");
      formData.append("password", "secret123!");
      formData.append("callbackUrl", "https://malicious-site.com");

      await loginAction(null, formData);

      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "runner@42.com",
        password: "secret123!",
        redirectTo: "/dashboard",
      });
    });

    it("catches AuthError and returns user-friendly error message", async () => {
      vi.mocked(signIn).mockRejectedValueOnce(new AuthError("Invalid credentials"));

      const formData = new FormData();
      formData.append("email", "runner@42.com");
      formData.append("password", "wrongPassword");

      const result = await loginAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Email o contraseña incorrectos",
      });
    });
  });

  describe("logoutAction", () => {
    it("calls signOut redirecting to /login", async () => {
      await logoutAction();
      expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
    });
  });

  describe("registerAction", () => {
    it("registers user and automatically signs in", async () => {
      vi.spyOn(registerModule, "registerUser").mockResolvedValueOnce({
        success: true,
        user: {
          id: "u1",
          email: "new@42.com",
          nick: "newrunner",
          passwordHash: "hash",
          roleGlobal: "user",
        },
      });

      const formData = new FormData();
      formData.append("email", "new@42.com");
      formData.append("password", "securePassword123!");
      formData.append("nick", "newrunner");

      const result = await registerAction(null, formData);

      expect(registerModule.registerUser).toHaveBeenCalled();
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "new@42.com",
        password: "securePassword123!",
        redirectTo: "/dashboard",
      });
      expect(result).toEqual({ success: true });
    });

    it("returns error if registration validation fails", async () => {
      vi.spyOn(registerModule, "registerUser").mockResolvedValueOnce({
        success: false,
        error: "El email ya está registrado",
      });

      const formData = new FormData();
      formData.append("email", "existing@42.com");
      formData.append("password", "securePassword123!");
      formData.append("nick", "runner");

      const result = await registerAction(null, formData);

      expect(signIn).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: "El email ya está registrado",
      });
    });
  });
});
