import type { DefaultSession } from "next-auth";
import type { GlobalRole } from "@/generated/prisma/client";

declare module "next-auth" {
  interface User {
    nick?: string;
    roleGlobal?: GlobalRole;
  }

  interface Session {
    user: {
      id: string;
      nick?: string;
      roleGlobal?: GlobalRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nick?: string;
    roleGlobal?: GlobalRole;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    nick?: string;
    roleGlobal?: GlobalRole;
  }
}
