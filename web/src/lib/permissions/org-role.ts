import { z } from "zod";
import type { MembershipRole } from "@/generated/prisma/client";
import {
  getCurrentUser,
  type CurrentUser,
  type CurrentUserResult,
} from "./current-user";
import { membershipRepository, type MembershipRepository } from "./membership-repository";

// The role a request enters a club with: a club role, or "admin" when an Admin
// enters a row that allows it (ORG_ROLES). Routes use "admin" to know it is not
// a Manager: the Admin does not read RPE or Feedback (matrix #2)
export type OrgRole = MembershipRole | "admin";

export type OrgRoleResult =
  | { ok: true; user: CurrentUser; role: OrgRole }
  | { ok: false; reason: "no-session" | "blocked" | "not-member" | "wrong-role" };

// The decision the adapters depend on: getOrgRole in the app, a fake in tests
export type OrgRoleCheck = (
  orgId: string,
  roles: readonly OrgRole[]
) => Promise<OrgRoleResult>;

export async function getOrgRole(
  orgId: string,
  roles: readonly OrgRole[],
  getUser: () => Promise<CurrentUserResult> = getCurrentUser,
  repo: MembershipRepository = membershipRepository
): Promise<OrgRoleResult> {
  const current = await getUser();
  if (!current.ok) {
    return current;
  }

  // A malformed id would make Prisma throw (500); for the caller it is just a club they cannot see
  // z.guid(), not z.uuid(): any 8-4-4-4-12 hex id, like Postgres (z.uuid() rejects the seed's 00000000-...-0001)
  if (!z.guid().safeParse(orgId).success) {
    return { ok: false, reason: "not-member" };
  }

  // Membership read from the database on every call, never from the JWT or the client
  const role = await repo.findRole(current.user.id, orgId);
  // A Manager of the club enters as Manager, Admin or not: in the rows that allow
  // the Admin, the Manager can always do at least as much (e.g. delete any chat
  // message, not only reported ones)
  if (role === "manager" && roles.includes(role)) {
    return { ok: true, user: current.user, role };
  }
  // Then the Admin, only in the rows that allow it: an Admin who is also an
  // Athlete of the club acts as Admin there (sees every Group, not only theirs).
  // Those rows hold no RPE or Feedback
  if (
    current.user.roleGlobal === "admin" &&
    roles.includes("admin") &&
    // A membership proves the club exists (foreign key); without one, ask,
    // so a made-up id still ends in 404
    (role !== null || (await repo.organizationExists(orgId)))
  ) {
    return { ok: true, user: current.user, role: "admin" };
  }
  // Every other row goes by the club role, for an Admin too
  if (!role) {
    return { ok: false, reason: "not-member" };
  }
  // A member without the role can see the club, so this is 403, not 404
  if (!roles.includes(role)) {
    return { ok: false, reason: "wrong-role" };
  }
  return { ok: true, user: current.user, role };
}
