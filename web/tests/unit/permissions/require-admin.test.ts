import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden, notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/permissions/require-admin";
import type { AdminResult } from "@/lib/permissions/admin";

// Every test passes its own check: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Like Next's redirect(), notFound() and forbidden(), which throw to stop rendering the page
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  forbidden: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
  }),
}));

const ADMIN = { id: "admin-1", email: "admin@42madrid.com", nick: "admin42", roleGlobal: "admin" } as const;

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/signed-out when there is no session", async () => {
    const noSession = async (): Promise<AdminResult> => ({ ok: false, reason: "no-session" });

    await expect(requireAdmin(noSession)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out");
  });

  it("redirects to /auth/signed-out with reason=blocked when the user is blocked", async () => {
    const blocked = async (): Promise<AdminResult> => ({ ok: false, reason: "blocked" });

    await expect(requireAdmin(blocked)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out?reason=blocked");
  });

  it("answers 404 when the user has a session but is not an Admin", async () => {
    const notAdmin = async (): Promise<AdminResult> => ({ ok: false, reason: "not-admin" });

    await expect(requireAdmin(notAdmin)).rejects.toThrow("404");

    expect(notFound).toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns the Admin without redirecting", async () => {
    const admin = async (): Promise<AdminResult> => ({ ok: true, user: ADMIN });

    expect(await requireAdmin(admin)).toEqual(ADMIN);

    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });
});
