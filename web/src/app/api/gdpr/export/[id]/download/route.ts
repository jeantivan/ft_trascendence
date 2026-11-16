import { readFile } from "node:fs/promises";
import path from "node:path";
import { findExportForDownload } from "@/lib/gdpr/export/find-export-for-download";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/gdpr/export/<id>/download?token=<token>: the ZIP of the signed-in user's own export.
// It needs the session AND the token from the email link (docs/gdpr/export-spec.md).
// 404 for a wrong or missing token, someone else's export, an unknown or malformed id,
// an expired export and a missing file alike.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireApiAuth();
  if (user instanceof Response) {
    return user;
  }

  const { id } = await params;
  const token = new URL(request.url).searchParams.get("token");
  if (!UUID.test(id) || token === null || token === "") {
    return notFound();
  }

  // The user id comes from the session, never from the URL
  const relativePath = await findExportForDownload(user.id, id, token);
  if (relativePath === null) {
    return notFound();
  }

  // Response only takes bytes backed by a plain ArrayBuffer, as readFile returns
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readFile(path.join(UPLOADS_DIR, relativePath));
  } catch (error) {
    // The row without its file (cleaned up or lost) is "not found"; any other disk error is a real failure
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return notFound();
    }
    throw error;
  }

  // no-store: the ZIP holds personal data, no cache (browser, NGINX, proxy) may keep it
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="my-data.zip"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
