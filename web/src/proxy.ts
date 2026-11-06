import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import { withPublicUrl } from "@/lib/auth/public-url";

const { auth } = NextAuth(authConfig);
// auth() acts as the proxy when Next.js calls it directly, a use its types do not cover
const authProxy = auth as unknown as (req: NextRequest, event: NextFetchEvent) => Promise<Response>;

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return authProxy(withPublicUrl(req), event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
