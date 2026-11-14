import { notFound, redirect } from "next/navigation";
import type { CurrentUser } from "./current-user";
import { getAdmin, type AdminCheck } from "./admin";

// For Admin pages and Server Actions. Same redirects as requireAuth for the
// session; signed in but not an Admin → 404, so the Admin area does not show it
// exists, as requireOrgRole does for non-members (#199, decided in #2).
// Call it outside try/catch: redirect() and notFound() throw, and a catch
// would swallow them (eslint.config.mjs rejects it inside a try block)
export async function requireAdmin(checkAdmin: AdminCheck = getAdmin): Promise<CurrentUser> {
  const result = await checkAdmin();
  if (!result.ok) {
    switch (result.reason) {
      case "no-session":
        redirect("/auth/signed-out");
      case "blocked":
        redirect("/auth/signed-out?reason=blocked");
      case "not-admin":
        notFound();
    }
  }
  return result.user;
}
