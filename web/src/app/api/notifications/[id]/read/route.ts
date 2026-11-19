// POST /api/notifications/<id>/read: marks one of the user's notifications as read (404 if not theirs)

import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { markNotificationRead } from "@/lib/notifications/queries";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth();
  if (auth instanceof Response) {
    return auth;
  }
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const count = await markNotificationRead(auth.id, BigInt(id));
  if (count === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}