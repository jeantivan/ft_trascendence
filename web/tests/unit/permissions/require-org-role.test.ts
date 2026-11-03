import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden, notFound, redirect } from "next/navigation";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import type { OrgRoleResult } from "@/lib/permissions/org-role";

// Every test passes its own getOrgRole: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

// Like Next's redirect(), notFound() and forbidden(), which throw to stop rendering
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

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

function decides(result: OrgRoleResult) {
  return async () => result;
}

describe("requireOrgRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/signed-out when there is no session", async () => {
    const noSession = decides({ ok: false, reason: "no-session" });

    await expect(requireOrgRole(CLUB, ["manager"], noSession)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out");
  });

  it("redirects to /auth/signed-out with reason=blocked when the user is blocked", async () => {
    const blocked = decides({ ok: false, reason: "blocked" });

    await expect(requireOrgRole(CLUB, ["manager"], blocked)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out?reason=blocked");
  });

  it("answers 404 with notFound() when the user is not a member of the club", async () => {
    // Same answer as a club that does not exist: nobody can probe which ids exist
    const notMember = decides({ ok: false, reason: "not-member" });

    await expect(requireOrgRole(CLUB, ["manager"], notMember)).rejects.toThrow("404");

    expect(notFound).toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("answers 403 with forbidden() when the user is a member without the role", async () => {
    const wrongRole = decides({ ok: false, reason: "wrong-role" });

    await expect(requireOrgRole(CLUB, ["manager"], wrongRole)).rejects.toThrow("403");

    expect(forbidden).toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("returns the user and their role when getOrgRole accepts them", async () => {
    const user = {
      id: "manager-1",
      email: "manager@42madrid.com",
      nick: "manager42",
      roleGlobal: "user",
    } as const;
    const accepted = decides({ ok: true, user, role: "manager" });

    const result = await requireOrgRole(CLUB, ["manager"], accepted);

    expect(result).toEqual({ user, role: "manager" });
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });
});
