import type { DefaultSession } from "next-auth";
import type { GlobalRole } from "@/generated/prisma/client";

declare module "next-auth" {
  interface User {
    nick?: string;
    /**
     * Informational only (e.g. for client-side UI).
     * Server authorization MUST verify the active role and blockedAt
     * status directly against the database on each request (see AGENTS.md).
     */
    roleGlobal?: GlobalRole;
  }

  interface Session {
    user: {
      id: string;
      nick?: string;
      /**
       * Informational only (e.g. for client-side UI).
       * Server authorization MUST verify the active role and blockedAt
       * status directly against the database on each request (see AGENTS.md).
       */
      roleGlobal?: GlobalRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nick?: string;
    /**
     * Informational only (e.g. for client-side UI).
     * Server authorization MUST verify the active role and blockedAt
     * status directly against the database on each request (see AGENTS.md).
     */
    roleGlobal?: GlobalRole;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    nick?: string;
    /**
     * Informational only (e.g. for client-side UI).
     * Server authorization MUST verify the active role and blockedAt
     * status directly against the database on each request (see AGENTS.md).
     */
    roleGlobal?: GlobalRole;
  }
}
