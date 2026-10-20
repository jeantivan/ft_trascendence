import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    nick?: string;
    role_global?: "admin" | "user";
  }

  interface Session {
    user: {
      id: string;
      nick?: string;
      role_global?: "admin" | "user";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nick?: string;
    role_global?: "admin" | "user";
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    nick?: string;
    role_global?: "admin" | "user";
  }
}
