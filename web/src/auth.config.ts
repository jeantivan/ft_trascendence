import type { NextAuthConfig } from "next-auth";
import { checkRouteAccess } from "@/lib/auth/routes";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const access = checkRouteAccess({
        pathname: nextUrl.pathname,
        isLoggedIn,
      });

      if (!access.allowed) {
        if ("status" in access && access.status === 401) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if ("redirectTo" in access && access.redirectTo && access.redirectTo !== "/login") {
          return Response.redirect(new URL(access.redirectTo, nextUrl));
        }
        return false;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.nick = user.nick;
        // Informational only for UI; server permissions must check the DB (see AGENTS.md)
        token.roleGlobal = user.roleGlobal;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = String(token.id);
        session.user.nick = typeof token.nick === "string" ? token.nick : undefined;
        // Informational only for UI; server permissions must check the DB (see AGENTS.md)
        session.user.roleGlobal = token.roleGlobal;
      }
      return session;
    },
  },
  providers: [],
};
