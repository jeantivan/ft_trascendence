import type { CurrentUser } from "./current-user";
import { getOrgRole, type OrgRole, type OrgRoleCheck } from "./org-role";
import { requireApiOrgRole } from "./require-api-org-role";

// For a Route Handler that receives a resource id. Same rules as
// requireOrgResource (session first, then 404 for missing or other club,
// 403 without the role), answered as JSON like requireApiOrgRole.
export async function requireApiOrgResource<T extends { orgId: string }>(
  resource: T | null,
  roles: readonly OrgRole[],
  checkOrgRole: OrgRoleCheck = getOrgRole
): Promise<{ resource: T; user: CurrentUser; role: OrgRole } | Response> {
  const result = await requireApiOrgRole(resource?.orgId ?? "", roles, checkOrgRole);
  if (result instanceof Response) {
    return result;
  }
  // Today "" already ended in not-member above; this check does not depend on it
  if (!resource) {
    return Response.json({ error: "Not Found" }, { status: 404 });
  }
  return { resource, user: result.user, role: result.role };
}
