import { beforeEach, describe, expect, it, vi } from "vitest";
import { forbidden, notFound, redirect } from "next/navigation";
import { requireOrgResource } from "@/lib/permissions/require-org-resource";
import type { CurrentUserResult } from "@/lib/permissions/current-user";
import { getOrgRole, type OrgRole } from "@/lib/permissions/org-role";
import { InMemoryMembershipRepository } from "../../support/in-memory-membership-repository";

// Every test passes its own user: the mock only keeps next-auth from loading
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
const OTHER_CLUB = "9d8e7f6a-5b4c-4d3e-a2f1-0e9d8c7b6a50";
const GROUP_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const USER = {
  id: "0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d",
  email: "runner@42madrid.com",
  nick: "runner42",
  roleGlobal: "user",
} as const;

async function activeUser(): Promise<CurrentUserResult> {
  return { ok: true, user: USER };
}

describe("requireOrgResource", () => {
  let repo: InMemoryMembershipRepository;
  // The real getOrgRole, with the user and memberships of each test
  let decide: (orgId: string, roles: readonly OrgRole[]) => ReturnType<typeof getOrgRole>;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new InMemoryMembershipRepository();
    decide = (orgId, roles) => getOrgRole(orgId, roles, activeUser, repo);
  });

  it("answers 404 with notFound() when the resource does not exist", async () => {
    await expect(requireOrgResource(null, ["manager"], decide)).rejects.toThrow("404");

    expect(notFound).toHaveBeenCalled();
  });

  it("answers 404 for a missing resource even if the role check lets the empty club id through", async () => {
    // Does not rely on getOrgRole rejecting "": a missing resource is never returned
    const alwaysAllowed = async () => ({ ok: true, user: USER, role: "manager" }) as const;

    await expect(requireOrgResource(null, ["manager"], alwaysAllowed)).rejects.toThrow("404");

    expect(notFound).toHaveBeenCalled();
  });

  it("checks the session before the resource: no session redirects even if it does not exist", async () => {
    // Otherwise a visitor could tell existing ids (redirect) from missing ones (404)
    const noSession = (orgId: string, roles: readonly OrgRole[]) =>
      getOrgRole(orgId, roles, async () => ({ ok: false, reason: "no-session" }), repo);

    await expect(requireOrgResource(null, ["manager"], noSession)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signed-out");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("answers 404 with notFound() when the resource belongs to another club, as if it did not exist", async () => {
    repo.add(USER.id, OTHER_CLUB, "manager");
    const group = { id: GROUP_ID, orgId: CLUB, name: "Maratón A" };

    await expect(requireOrgResource(group, ["manager"], decide)).rejects.toThrow("404");

    expect(notFound).toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("answers 403 with forbidden() when the user is in the resource's club without the role", async () => {
    repo.add(USER.id, CLUB, "athlete");
    const group = { id: GROUP_ID, orgId: CLUB, name: "Maratón A" };

    await expect(requireOrgResource(group, ["manager"], decide)).rejects.toThrow("403");

    expect(forbidden).toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("returns the resource, the user and their role when the user may act on it", async () => {
    repo.add(USER.id, CLUB, "manager");
    const group = { id: GROUP_ID, orgId: CLUB, name: "Maratón A" };

    const result = await requireOrgResource(group, ["manager"], decide);

    expect(result).toEqual({ resource: group, user: USER, role: "manager" });
  });
});
