import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { withPublicUrl } from "@/lib/auth/public-url";

export const GET = (req: NextRequest) => handlers.GET(withPublicUrl(req));
export const POST = (req: NextRequest) => handlers.POST(withPublicUrl(req));
