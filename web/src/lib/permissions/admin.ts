import {
  getCurrentUser,
  type CurrentUser,
  type CurrentUserResult,
} from "./current-user";

export type AdminResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "no-session" | "blocked" | "not-admin" };

// The decision the adapters depend on: getAdmin in the app, a fake in tests
export type AdminCheck = () => Promise<AdminResult>;

// roleGlobal comes from the database on every call (getCurrentUser), never from the JWT
export async function getAdmin(
  getUser: () => Promise<CurrentUserResult> = getCurrentUser
): Promise<AdminResult> {
  const current = await getUser();
  if (!current.ok) {
    return current;
  }
  if (current.user.roleGlobal !== "admin") {
    return { ok: false, reason: "not-admin" };
  }
  return { ok: true, user: current.user };
}
