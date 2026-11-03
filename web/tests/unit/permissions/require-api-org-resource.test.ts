import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipRole } from "@/generated/prisma/client";
import { requireApiOrgResource } from "@/lib/permissions/require-api-org-resource";
import type { CurrentUserResult } from "@/lib/permissions/current-user";
import { getOrgRole } from "@/lib/permissions/org-role";
import { InMemoryMembershipRepository } from "../../support/in-memory-membership-repository";

// Every test passes its own user: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const OTHER_CLUB = "9d8e7f6a-5b4c-4d3e-a2f1-0e9d8c7b6a50";
const EVENT_ID = "4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a";
const USER = {
  id: "0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d",
  email: "runner@42madrid.com",
  nick: "runner42",
  roleGlobal: "user",
} as const;

async function activeUser(): Promise<CurrentUserResult> {
  return { ok: true, user: USER };
}

describe("requireApiOrgResource", () => {
  let repo: InMemoryMembershipRepository;

  beforeEach(() => {
    repo = new InMemoryMembershipRepository();
  });

  it("checks the session before the resource: 401, not 404, when there is no session", async () => {
    const noSession = (orgId: string, roles: readonly MembershipRole[]) =>
      getOrgRole(orgId, roles, async () => ({ ok: false, reason: "no-session" }), repo);

    const result = await requireApiOrgResource(null, ["manager"], noSession);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(401);
  });

  it("answers 404 JSON when the resource belongs to another club, as if it did not exist", async () => {
    repo.add(USER.id, OTHER_CLUB, "manager");
    const event = { id: EVENT_ID, orgId: CLUB, title: "Tirada larga del domingo" };
    const decide = (orgId: string, roles: readonly MembershipRole[]) =>
      getOrgRole(orgId, roles, activeUser, repo);

    const result = await requireApiOrgResource(event, ["manager"], decide);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: "Not Found" });
  });

  it("answers 404 JSON for a missing resource even if the role check lets the empty club id through", async () => {
    // Does not rely on getOrgRole rejecting "": a missing resource is never returned
    const alwaysAllowed = async () => ({ ok: true, user: USER, role: "manager" }) as const;

    const result = await requireApiOrgResource(null, ["manager"], alwaysAllowed);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: "Not Found" });
  });

  it("returns the resource, the user and their role when the user may act on it", async () => {
    repo.add(USER.id, CLUB, "athlete");
    const event = { id: EVENT_ID, orgId: CLUB, title: "Tirada larga del domingo" };
    const decide = (orgId: string, roles: readonly MembershipRole[]) =>
      getOrgRole(orgId, roles, activeUser, repo);

    const result = await requireApiOrgResource(event, ["manager", "athlete"], decide);

    expect(result).toEqual({ resource: event, user: USER, role: "athlete" });
  });
});
