import { redirect } from "next/navigation";
import {
  getCurrentUser,
  type CurrentUser,
  type CurrentUserResult,
} from "./current-user";

// Always through /auth/signed-out: it clears the JWT, so the proxy cannot
// bounce a blocked or deleted user from /login back to the page in a loop.
// Call it outside try/catch: redirect() throws, and a catch would swallow it
// (eslint.config.mjs rejects it inside a try block)
export async function requireAuth(
  getUser: () => Promise<CurrentUserResult> = getCurrentUser
): Promise<CurrentUser> {
  const result = await getUser();
  if (!result.ok) {
    redirect(
      result.reason === "blocked"
        ? "/auth/signed-out?reason=blocked"
        : "/auth/signed-out"
    );
  }
  return result.user;
}
