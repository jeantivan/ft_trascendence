import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/permissions/require-auth";

// Every test passes its own getCurrentUser: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Like Next's redirect(), which throws to stop rendering the page
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/signed-out when there is no session", async () => {
    const noSession = async () => ({ ok: false, reason: "no-session" }) as const;

    await expect(requireAuth(noSession)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out");
  });

  it("redirects to /auth/signed-out with reason=blocked when the user is blocked", async () => {
    const blocked = async () => ({ ok: false, reason: "blocked" }) as const;

    await expect(requireAuth(blocked)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out?reason=blocked");
  });

  it("returns the user without redirecting when getCurrentUser accepts it", async () => {
    const user = {
      id: "athlete-1",
      email: "athlete@42madrid.com",
      nick: "athlete42",
      roleGlobal: "user",
    } as const;
    const validUser = async () => ({ ok: true, user }) as const;

    const result = await requireAuth(validUser);

    expect(result).toEqual(user);
    expect(redirect).not.toHaveBeenCalled();
  });
});
