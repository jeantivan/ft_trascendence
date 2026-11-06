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
        if ("redirectTo" in access) {
          // Only the path: Auth.js would store the full address, and login only accepts
          // paths (lib/auth/actions.ts) so nobody can be sent to another site after it
          if (access.redirectTo === "/login") {
            const login = new URL("/login", nextUrl);
            login.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
            return Response.redirect(login, 307);
          }
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
