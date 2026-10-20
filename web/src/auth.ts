import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { userRepository } from "@/lib/auth/user-repository";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (session.user && token.id) {
        const user = await userRepository.findById(String(token.id));
        if (!user || user.blockedAt) {
          return {
            ...session,
            user: undefined as unknown as typeof session.user,
          };
        }
        session.user.id = user.id;
        session.user.nick = user.nick;
        session.user.role_global = user.role_global;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials) => authorizeCredentials(credentials),
    }),
  ],
});
