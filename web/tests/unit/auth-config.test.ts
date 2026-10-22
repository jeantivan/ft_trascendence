import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";
import type { NextURL } from "next/dist/server/web/next-url";

describe("Auth.js Base Configuration and Callbacks", () => {
  describe("jwt callback", () => {
    const jwtCallback = authConfig.callbacks?.jwt;

    it("populates token with id, nick, and roleGlobal on initial sign-in", async () => {
      expect(jwtCallback).toBeDefined();
      if (!jwtCallback) return;

      const user = {
        id: "user-uuid-123",
        email: "runner@42madrid.com",
        nick: "fastrunner",
        roleGlobal: "user" as const,
      };

      const token = await jwtCallback({
        token: {},
        user,
        account: null,
        trigger: "signIn",
      });

      expect(token).toEqual({
        id: "user-uuid-123",
        nick: "fastrunner",
        roleGlobal: "user",
      });
    });

    it("preserves token data across subsequent invocations without user", async () => {
      expect(jwtCallback).toBeDefined();
      if (!jwtCallback) return;

      const existingToken = {
        id: "user-uuid-123",
        nick: "fastrunner",
        roleGlobal: "admin" as const,
      };

      const token = await jwtCallback({
        token: existingToken,
        account: null,
      } as unknown as Parameters<NonNullable<typeof jwtCallback>>[0]);

      expect(token).toEqual(existingToken);
    });
  });

  describe("session callback", () => {
    const sessionCallback = authConfig.callbacks?.session;

    it("attaches user attributes from token to session.user", async () => {
      expect(sessionCallback).toBeDefined();
      if (!sessionCallback) return;

      const baseSession = {
        user: {
          id: "",
          email: "runner@42madrid.com",
        },
        expires: new Date(Date.now() + 3600 * 1000).toISOString(),
      };

      const token = {
        id: "user-uuid-123",
        nick: "fastrunner",
        roleGlobal: "user" as const,
      };

      type SessionCallbackFn = (params: {
        session: typeof baseSession;
        token: typeof token;
        user?: unknown;
        newSession?: unknown;
      }) => Promise<{ user: unknown }>;

      const result = await (sessionCallback as unknown as SessionCallbackFn)({
        session: baseSession,
        token,
        user: undefined,
        newSession: null,
      });

      expect(result.user).toEqual({
        id: "user-uuid-123",
        email: "runner@42madrid.com",
        nick: "fastrunner",
        roleGlobal: "user",
      });
    });
  });

  describe("authorized callback", () => {
    const authorizedCallback = authConfig.callbacks?.authorized;

    type AuthorizedParams = Parameters<NonNullable<typeof authorizedCallback>>[0];

    function createMockRequest(pathname: string): AuthorizedParams["request"] {
      const url = new URL(`http://localhost:3000${pathname}`);
      return {
        nextUrl: url as unknown as NextURL,
      } as unknown as AuthorizedParams["request"];
    }

    it("allows unauthenticated access to public routes", async () => {
      expect(authorizedCallback).toBeDefined();
      if (!authorizedCallback) return;

      const allowedLogin = await authorizedCallback({
        auth: null,
        request: createMockRequest("/login"),
      });
      expect(allowedLogin).toBe(true);

      const allowedHome = await authorizedCallback({
        auth: null,
        request: createMockRequest("/"),
      });
      expect(allowedHome).toBe(true);
    });

    it("denies unauthenticated access to protected routes", async () => {
      expect(authorizedCallback).toBeDefined();
      if (!authorizedCallback) return;

      const result = await authorizedCallback({
        auth: null,
        request: createMockRequest("/dashboard"),
      });
      expect(result).toBe(false);
    });

    it("redirects authenticated user away from login to dashboard", async () => {
      expect(authorizedCallback).toBeDefined();
      if (!authorizedCallback) return;

      const authSession = {
        user: {
          id: "u1",
          email: "runner@42.com",
        },
        expires: "future",
      };

      const result = await authorizedCallback({
        auth: authSession as unknown as AuthorizedParams["auth"],
        request: createMockRequest("/login"),
      });

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    });

    it("allows authenticated user access to protected routes", async () => {
      expect(authorizedCallback).toBeDefined();
      if (!authorizedCallback) return;

      const authSession = {
        user: {
          id: "u1",
          email: "runner@42.com",
        },
        expires: "future",
      };

      const result = await authorizedCallback({
        auth: authSession as unknown as AuthorizedParams["auth"],
        request: createMockRequest("/dashboard"),
      });

      expect(result).toBe(true);
    });
  });
});
