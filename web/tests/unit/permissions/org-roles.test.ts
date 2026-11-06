import { describe, expect, it, vi } from "vitest";
import type { MembershipRole } from "@/generated/prisma/client";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { getOrgRole } from "@/lib/permissions/org-role";
import type { CurrentUserResult } from "@/lib/permissions/current-user";
import { InMemoryMembershipRepository } from "../../support/in-memory-membership-repository";

// Every test passes its own user: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const USER_ID = "0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d";

// Written by hand from the club-level rows of the permission matrix (#2),
// independently of ORG_ROLES: if the code drifts from the matrix, a test fails
const MATRIX: Record<string, { manager: boolean; athlete: boolean }> = {
  "organization.read": { manager: true, athlete: true },
  "organization.updateDescription": { manager: true, athlete: false },
  "member.read": { manager: true, athlete: false },
  "member.expel": { manager: true, athlete: false },
  "membership.leave": { manager: true, athlete: true },
  "invitation.manage": { manager: true, athlete: false },
  "membershipRequest.review": { manager: true, athlete: false },
  "group.read": { manager: true, athlete: true },
  "group.write": { manager: true, athlete: false },
  "trainingTemplate.read": { manager: true, athlete: true },
  "trainingTemplate.write": { manager: true, athlete: false },
  "session.read": { manager: true, athlete: true },
  "session.write": { manager: true, athlete: false },
  "freeSession.read": { manager: true, athlete: true },
  "freeSession.write": { manager: false, athlete: true },
  "sessionMetrics.read": { manager: true, athlete: true },
  "sessionMetrics.write": { manager: false, athlete: true },
  "event.read": { manager: true, athlete: true },
  "event.readAttendees": { manager: true, athlete: false },
  "event.write": { manager: true, athlete: false },
  "spotRequest.review": { manager: true, athlete: false },
  "spotRequest.request": { manager: false, athlete: true },
  "eventChat.post": { manager: true, athlete: true },
  "eventChat.moderate": { manager: true, athlete: false },
  "feedback.read": { manager: true, athlete: true },
  "feedback.write": { manager: true, athlete: false },
  "clubProfile.read": { manager: true, athlete: true },
  "clubProfile.update": { manager: false, athlete: true },
};

async function activeUser(): Promise<CurrentUserResult> {
  return {
    ok: true,
    user: { id: USER_ID, email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" },
  };
}

async function reasonFor(memberRole: MembershipRole, allowed: readonly MembershipRole[]) {
  const repo = new InMemoryMembershipRepository();
  repo.add(USER_ID, CLUB, memberRole);
  const result = await getOrgRole(CLUB, allowed, activeUser, repo);
  return result.ok ? "ok" : result.reason;
}

describe("ORG_ROLES", () => {
  it("has exactly the club-level rows of the matrix", () => {
    expect(Object.keys(ORG_ROLES).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  it.each(Object.entries(MATRIX))("%s follows the matrix", async (permission, expected) => {
    const allowed = ORG_ROLES[permission as keyof typeof ORG_ROLES];

    expect(await reasonFor("manager", allowed)).toBe(expected.manager ? "ok" : "wrong-role");
    expect(await reasonFor("athlete", allowed)).toBe(expected.athlete ? "ok" : "wrong-role");
  });
});
