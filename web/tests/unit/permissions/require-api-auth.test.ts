import { describe, expect, it, vi } from "vitest";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// Every test passes its own getCurrentUser: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

describe("requireApiAuth", () => {
  it("answers 401 JSON when there is no session", async () => {
    const noSession = async () => ({ ok: false, reason: "no-session" }) as const;

    const result = await requireApiAuth(noSession);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 401 JSON when the user is blocked", async () => {
    const blocked = async () => ({ ok: false, reason: "blocked" }) as const;

    const result = await requireApiAuth(blocked);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns the user when getCurrentUser accepts it", async () => {
    const user = {
      id: "athlete-1",
      email: "athlete@42madrid.com",
      nick: "athlete42",
      roleGlobal: "user",
    } as const;
    const validUser = async () => ({ ok: true, user }) as const;

    const result = await requireApiAuth(validUser);

    expect(result).toEqual(user);
  });
});
