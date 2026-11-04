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

// The photo itself: no-cache lets the browser keep it but makes it ask before
// every use, so whoever loses permission (or the photo of a deleted account)
// stops seeing it at once (PR #88). An id never changes its bytes, so the id is
// the ETag: if the browser already has it, the answer is 304 with no body.
function photoHeaders(id: string): Record<string, string> {
  return { ...IMAGE_HEADERS, "Cache-Control": "private, no-cache", ETag: `"${id}"` };
}

// If-None-Match holds the ETags the browser already has: one, a comma list,
// weak ones (W/"..."), or * for "any"
function browserHasIt(request: Request, etag: string): boolean {
  const header = request.headers.get("If-None-Match");
  if (header === null) {
    return false;
  }
  for (const tag of header.split(",")) {
    const trimmed = tag.trim();
    if (trimmed === "*" || trimmed === etag || trimmed === "W/" + etag) {
      return true;
    }
  }
  return false;
}

// The same answer for no permission, unknown id and missing file, so
// nobody can tell whether a photo exists (#23, an exception to the 404 rule).
function silhouette(): Response {
  return new Response(SILHOUETTE_SVG, { headers: { ...IMAGE_HEADERS, "Content-Type": "image/svg+xml" } });
}

// GET /api/files/<id>: the avatar that User.image points at
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // proxy.ts already answers 401 without a session; this is the second barrier
  // in case the route is ever reached without it (same 401 as the rest of the API, #46)
  const viewer = await requireApiAuth();
  if (viewer instanceof Response) {
    return viewer;
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

  // Only after the permission check: a 304 also means "keep showing it"
  const headers = photoHeaders(id);
  if (browserHasIt(request, headers.ETag)) {
    return new Response(null, { status: 304, headers });
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

  return new Response(bytes, { headers: { ...headers, "Content-Type": avatar.mimeType } });
}
