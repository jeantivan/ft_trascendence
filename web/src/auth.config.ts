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
        if (access.redirectTo && access.redirectTo !== "/login") {
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
        token.role_global = user.role_global;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = String(token.id);
        session.user.nick = typeof token.nick === "string" ? token.nick : undefined;
        session.user.role_global = typeof token.role_global === "string" ? token.role_global : undefined;
      }
      return session;
    },
  },
  providers: [],
};
