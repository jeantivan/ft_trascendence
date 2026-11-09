import type { CurrentUser } from "./current-user";
import { getOrgRole, type OrgRole, type OrgRoleCheck } from "./org-role";

// For Route Handlers: always JSON, never forbidden()/notFound(), which render pages.
// Blocked and no-session get the same 401, as in requireApiAuth.
// The caller returns the Response as is: if (result instanceof Response) return result;
export async function requireApiOrgRole(
  orgId: string,
  roles: readonly OrgRole[],
  checkOrgRole: OrgRoleCheck = getOrgRole
): Promise<{ user: CurrentUser; role: OrgRole } | Response> {
  const result = await checkOrgRole(orgId, roles);
  if (!result.ok) {
    switch (result.reason) {
      case "not-member":
        return Response.json({ error: "Not Found" }, { status: 404 });
      case "wrong-role":
        return Response.json({ error: "Forbidden" }, { status: 403 });
      case "no-session":
      case "blocked":
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return { user: result.user, role: result.role };
}
