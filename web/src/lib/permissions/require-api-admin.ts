import type { CurrentUser } from "./current-user";
import { getAdmin, type AdminCheck } from "./admin";

// For Admin Route Handlers: always JSON, never forbidden()/notFound(), which render pages.
// Signed in but not an Admin → 404, as requireApiOrgRole does for non-members (#199, decided in #2).
// Blocked and no-session get the same 401, as in requireApiAuth.
// The caller returns the Response as is: if (result instanceof Response) return result;
export async function requireApiAdmin(
  checkAdmin: AdminCheck = getAdmin
): Promise<CurrentUser | Response> {
  const result = await checkAdmin();
  if (!result.ok) {
    switch (result.reason) {
      case "not-admin":
        return Response.json({ error: "Not Found" }, { status: 404 });
      case "no-session":
      case "blocked":
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return result.user;
}
