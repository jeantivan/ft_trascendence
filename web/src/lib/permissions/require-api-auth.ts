import {
  getCurrentUser,
  type CurrentUser,
  type CurrentUserResult,
} from "./current-user";

// Blocked and no-session get the same 401: only pages show the blocked notice
export async function requireApiAuth(
  getUser: () => Promise<CurrentUserResult> = getCurrentUser
): Promise<CurrentUser | Response> {
  const result = await getUser();
  if (!result.ok) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return result.user;
}
