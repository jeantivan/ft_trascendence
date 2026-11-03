import { z } from "zod";
import type { MembershipRole } from "@/generated/prisma/client";
import {
  getCurrentUser,
  type CurrentUser,
  type CurrentUserResult,
} from "./current-user";
import { membershipRepository, type MembershipRepository } from "./membership-repository";

export type OrgRoleResult =
  | { ok: true; user: CurrentUser; role: MembershipRole }
  | { ok: false; reason: "no-session" | "blocked" | "not-member" | "wrong-role" };

// The decision the adapters depend on: getOrgRole in the app, a fake in tests
export type OrgRoleCheck = (
  orgId: string,
  roles: readonly MembershipRole[]
) => Promise<OrgRoleResult>;

export async function getOrgRole(
  orgId: string,
  roles: readonly MembershipRole[],
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
  if (!role) {
    return { ok: false, reason: "not-member" };
  }
  // A member without the role can see the club, so this is 403, not 404
  if (!roles.includes(role)) {
    return { ok: false, reason: "wrong-role" };
  }
  return { ok: true, user: current.user, role };
}
