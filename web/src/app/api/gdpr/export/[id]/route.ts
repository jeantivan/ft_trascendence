import { getExportStatus } from "@/lib/gdpr/export/get-export-status";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/gdpr/export/<id>: the status of an export the signed-in user asked for (#165).
// 404 for someone else's export, an unknown id and a malformed id alike.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireApiAuth();
  if (user instanceof Response) {
    return user;
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return notFound();
  }

  // The user id comes from the session, never from the URL
  const status = await getExportStatus(user.id, id);
  if (status === null) {
    return notFound();
  }
  return Response.json({ status: status.status, expires_at: status.expiresAt?.toISOString() ?? null });
}

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
