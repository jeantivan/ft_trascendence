import { open } from "node:fs/promises";
import { Readable } from "node:stream";
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

  // The file is streamed, never read whole: an export can be big. The handle is opened once
  // and sized from the same handle, so a file removed meanwhile cannot make them disagree
  let handle;
  try {
    handle = await open(path.join(UPLOADS_DIR, relativePath));
  } catch (error) {
    // The row without its file (cleaned up or lost) is "not found"; any other disk error is a real failure
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return notFound();
    }
    throw error;
  }
  const { size } = await handle.stat().catch(async (error) => {
    await handle.close();
    throw error;
  });
  // The stream closes the handle when it ends, fails or the client cancels
  const body = Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>;

  // no-store: the ZIP holds personal data, no cache (browser, NGINX, proxy) may keep it
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(size),
      "Content-Disposition": 'attachment; filename="my-data.zip"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
