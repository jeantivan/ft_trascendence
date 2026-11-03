import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { prisma } from "@/lib/prisma";
import { canViewAvatar } from "@/lib/uploads/can-view-avatar";
import { SILHOUETTE_SVG } from "@/lib/uploads/silhouette";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// private: no shared cache (NGINX, a proxy) may keep a photo, or the silhouette,
// and serve it to another user. nosniff: the browser uses our Content-Type as is.
const IMAGE_HEADERS = { "Cache-Control": "private", "X-Content-Type-Options": "nosniff" };

// The same answer for no session, no permission, unknown id and missing file, so
// nobody can tell whether a photo exists (#23, an exception to the 404 rule).
function silhouette(): Response {
  return new Response(SILHOUETTE_SVG, { headers: { ...IMAGE_HEADERS, "Content-Type": "image/svg+xml" } });
}

// GET /api/files/<id>: the avatar that User.image points at
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // PROVISIONAL: no session gets the silhouette too; asked on #23 whether it should be a 401
  const viewer = await requireApiAuth();
  if (viewer instanceof Response) {
    return silhouette();
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return silhouette();
  }

  const avatar = await prisma.avatar.findUnique({
    where: { id },
    select: { ownerId: true, mimeType: true, path: true },
  });
  if (avatar === null || !(await canViewAvatar(viewer, avatar.ownerId))) {
    return silhouette();
  }

  // Response only takes bytes backed by a plain ArrayBuffer, as readFile returns
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readFile(path.join(UPLOADS_DIR, avatar.path));
  } catch (error) {
    // The row without its file is "no photo"; any other disk error is a real failure
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return silhouette();
    }
    throw error;
  }

  return new Response(bytes, { headers: { ...IMAGE_HEADERS, "Content-Type": avatar.mimeType } });
}
