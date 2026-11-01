import { forbidden, notFound, redirect } from "next/navigation";
import type { MembershipRole } from "@/generated/prisma/client";
import type { CurrentUser } from "./current-user";
import { getOrgRole, type OrgRoleCheck } from "./org-role";

// For pages and Server Actions. Same redirects as requireAuth for the session;
// not a member → 404 (hides which clubs exist), member without the role → 403.
// Call it outside try/catch: redirect(), notFound() and forbidden() throw,
// and a catch would swallow them (eslint.config.mjs rejects it inside a try block)
export async function requireOrgRole(
  orgId: string,
  roles: readonly MembershipRole[],
  checkOrgRole: OrgRoleCheck = getOrgRole
): Promise<{ user: CurrentUser; role: MembershipRole }> {
  const result = await checkOrgRole(orgId, roles);
  if (!result.ok) {
    switch (result.reason) {
      case "no-session":
        redirect("/auth/signed-out");
      case "blocked":
        redirect("/auth/signed-out?reason=blocked");
      case "not-member":
        notFound();
      case "wrong-role":
        forbidden();
    }
  }
  return { user: result.user, role: result.role };
}
