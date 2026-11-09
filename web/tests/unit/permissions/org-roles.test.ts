import { describe, expect, it, vi } from "vitest";
import type { MembershipRole } from "@/generated/prisma/client";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { getOrgRole, type OrgRole } from "@/lib/permissions/org-role";
import type { CurrentUserResult } from "@/lib/permissions/current-user";
import { InMemoryMembershipRepository } from "../../support/in-memory-membership-repository";

// Every test passes its own user: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const USER_ID = "0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d";

// Written by hand from the club-level rows of the permission matrix (#2),
// independently of ORG_ROLES: if the code drifts from the matrix, a test fails.
// admin: an Admin who is not a member of the club (the matrix's Admin column)
const MATRIX: Record<string, { manager: boolean; athlete: boolean; admin: boolean }> = {
  "organization.read": { manager: true, athlete: true, admin: true },
  "organization.updateDescription": { manager: true, athlete: false, admin: false },
  "member.read": { manager: true, athlete: false, admin: false },
  "member.expel": { manager: true, athlete: false, admin: true },
  "membership.leave": { manager: true, athlete: true, admin: false },
  "invitation.manage": { manager: true, athlete: false, admin: false },
  "membershipRequest.review": { manager: true, athlete: false, admin: false },
  "group.read": { manager: true, athlete: true, admin: true },
  "group.write": { manager: true, athlete: false, admin: false },
  "group.delete": { manager: true, athlete: false, admin: true },
  "trainingTemplate.read": { manager: true, athlete: true, admin: false },
  "trainingTemplate.write": { manager: true, athlete: false, admin: false },
  "session.read": { manager: true, athlete: true, admin: false },
  "session.write": { manager: true, athlete: false, admin: false },
  "freeSession.read": { manager: true, athlete: true, admin: false },
  "freeSession.write": { manager: false, athlete: true, admin: false },
  "sessionMetrics.read": { manager: true, athlete: true, admin: false },
  "sessionMetrics.write": { manager: false, athlete: true, admin: false },
  "event.read": { manager: true, athlete: true, admin: true },
  "event.readAttendees": { manager: true, athlete: false, admin: false },
  "event.write": { manager: true, athlete: false, admin: false },
  "event.delete": { manager: true, athlete: false, admin: true },
  "spotRequest.review": { manager: true, athlete: false, admin: false },
  "spotRequest.request": { manager: false, athlete: true, admin: false },
  "eventChat.post": { manager: true, athlete: true, admin: false },
  "eventChat.moderate": { manager: true, athlete: false, admin: true },
  "feedback.read": { manager: true, athlete: true, admin: false },
  "feedback.write": { manager: true, athlete: false, admin: false },
  "clubProfile.read": { manager: true, athlete: true, admin: false },
  "clubProfile.update": { manager: false, athlete: true, admin: false },
};

async function activeUser(): Promise<CurrentUserResult> {
  return {
    ok: true,
    user: { id: USER_ID, email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" },
  };
}

async function admin(): Promise<CurrentUserResult> {
  return {
    ok: true,
    user: { id: USER_ID, email: "admin@42madrid.com", nick: "admin42", roleGlobal: "admin" },
  };
}

// An Admin with no membership in the club: "ok" means they enter as role admin
async function adminReasonFor(allowed: readonly OrgRole[]) {
  const repo = new InMemoryMembershipRepository();
  repo.addOrganization(CLUB);
  const result = await getOrgRole(CLUB, allowed, admin, repo);
  if (!result.ok) return result.reason;
  return result.role === "admin" ? "ok" : `entered as ${result.role}`;
}

// An Admin who is also a member of the club: the role they enter with, or the reason
async function adminMemberResultFor(memberRole: MembershipRole, allowed: readonly OrgRole[]) {
  const repo = new InMemoryMembershipRepository();
  repo.add(USER_ID, CLUB, memberRole);
  const result = await getOrgRole(CLUB, allowed, admin, repo);
  return result.ok ? result.role : result.reason;
}

async function reasonFor(memberRole: MembershipRole, allowed: readonly OrgRole[]) {
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
    expect(await adminReasonFor(allowed)).toBe(expected.admin ? "ok" : "not-member");
    // An Admin who is an Athlete acts as Admin where the matrix lets the Admin in,
    // and as Athlete everywhere else
    expect(await adminMemberResultFor("athlete", allowed)).toBe(
      expected.admin ? "admin" : expected.athlete ? "athlete" : "wrong-role",
    );
    // An Admin who is a Manager never loses what the Manager can do
    expect(await adminMemberResultFor("manager", allowed)).toBe(
      expected.manager ? "manager" : expected.admin ? "admin" : "wrong-role",
    );
  });
});
