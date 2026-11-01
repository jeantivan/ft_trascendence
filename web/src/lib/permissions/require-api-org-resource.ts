import type { MembershipRole } from "@/generated/prisma/client";
import type { CurrentUser } from "./current-user";
import { getOrgRole, type OrgRoleCheck } from "./org-role";
import { requireApiOrgRole } from "./require-api-org-role";

// For a Route Handler that receives a resource id. Same rules as
// requireOrgResource (session first, then 404 for missing or other club,
// 403 without the role), answered as JSON like requireApiOrgRole.
export async function requireApiOrgResource<T extends { orgId: string }>(
  resource: T | null,
  roles: readonly MembershipRole[],
  checkOrgRole: OrgRoleCheck = getOrgRole
): Promise<{ resource: T; user: CurrentUser; role: MembershipRole } | Response> {
  const result = await requireApiOrgRole(resource?.orgId ?? "", roles, checkOrgRole);
  if (result instanceof Response) {
    return result;
  }
  // requireApiOrgRole only accepts a real club id, so resource is not null here
  return { resource: resource as T, user: result.user, role: result.role };
}
