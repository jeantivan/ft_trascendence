import { cache } from "react";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import {
  currentUserRepository,
  type CurrentUserRecord,
  type CurrentUserRepository,
} from "./current-user-repository";

// What callers get: the record without blockedAt, which only matters here
export type CurrentUser = Omit<CurrentUserRecord, "blockedAt">;

export type CurrentUserResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "no-session" | "blocked" };

// One database read per page render (#291), shared by the layout, the template
// and the page; a block still shows on the next request. Server Actions and
// route handlers run outside a render: there every call reads again
export const getCurrentUser = cache(async function getCurrentUser(
  getSession: () => Promise<Session | null> = auth,
  repo: CurrentUserRepository = currentUserRepository
): Promise<CurrentUserResult> {
  // auth.config.ts only sets user.id when the JWT carries one
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, reason: "no-session" };
  }

  // A valid JWT does not mean the user still exists: it may have been deleted
  const user = await repo.findById(session.user.id);
  if (!user) {
    return { ok: false, reason: "no-session" };
  }
  if (user.blockedAt) {
    return { ok: false, reason: "blocked" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      nick: user.nick,
      roleGlobal: user.roleGlobal,
    },
  };
});
