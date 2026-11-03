import { notFound } from "next/navigation";
import type { MembershipRole } from "@/generated/prisma/client";
import type { CurrentUser } from "./current-user";
import { getOrgRole, type OrgRoleCheck } from "./org-role";
import { requireOrgRole } from "./require-org-role";

// For a page or Server Action that receives a resource id (a Group, an Event...).
// The caller loads the resource first with findOrgResource, which turns a
// malformed or missing id into null.
// A missing resource becomes an empty club id, so getOrgRole still checks the
// session first and then answers not-member: a visitor gets the same redirect
// whether the id exists or not, and a member gets the same 404 for a missing
// resource and for one from another club.
export async function requireOrgResource<T extends { orgId: string }>(
  resource: T | null,
  roles: readonly MembershipRole[],
  checkOrgRole: OrgRoleCheck = getOrgRole
): Promise<{ resource: T; user: CurrentUser; role: MembershipRole }> {
  const { user, role } = await requireOrgRole(resource?.orgId ?? "", roles, checkOrgRole);
  // Today "" already ended in not-member above; this check does not depend on it
  if (!resource) {
    notFound();
  }
  return { resource, user, role };
}
