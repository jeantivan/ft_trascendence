import { unlink } from "node:fs/promises";
import path from "node:path";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { prisma } from "@/lib/prisma";
import { checkImage, MAX_IMAGE_BYTES } from "@/lib/uploads/check-image";
import { saveAvatar } from "@/lib/uploads/save-avatar";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

// Room for the multipart boundaries and part headers around the image itself
const FORM_OVERHEAD_BYTES = 64 * 1024;

// POST /api/upload: the signed-in user uploads their avatar (#23), as multipart
// form data with the image in the "file" field.
export async function POST(request: Request): Promise<Response> {
  const user = await requireApiAuth();
  if (user instanceof Response) {
    return user;
  }

  // formData() reads the whole body into memory: reject big requests before that.
  // With Node's HTTP/1.1 server the body is exactly Content-Length bytes, but that is
  // the runtime's behaviour, not a promise of this code: the hard cap belongs in NGINX
  // (client_max_body_size). The image inside can still lie; checkImage checks its size.
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) {
    return Response.json({ error: "Content-Length required" }, { status: 411 });
  }
  // HTTP allows only digits here. Number() alone would take "abc" (NaN, and NaN > limit
  // is false, so it would pass), "0x10", "1e3" or "-1".
  if (!/^\d+$/.test(contentLength)) {
    return Response.json({ error: "Invalid Content-Length" }, { status: 400 });
  }
  if (Number(contentLength) > MAX_IMAGE_BYTES + FORM_OVERHEAD_BYTES) {
    return Response.json({ error: "File too large" }, { status: 413 });
  }

  // formData() also parses url-encoded forms, which cannot carry a file: only multipart.
  // The media type is what comes before "; boundary=...", and it is case-insensitive.
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "multipart/form-data") {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 415 });
  }

  // A cut-off or malformed body makes formData() throw a TypeError: the client's fault.
  // Anything else is ours, so it goes on to the logs as a 500.
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    if (error instanceof TypeError) {
      return Response.json({ error: "Malformed form data" }, { status: 400 });
    }
    throw error;
  }
  const file = form.get("file");
  // get() returns null without the field, and a string for a text field
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(bytes);
  if (!check.ok) {
    if (check.reason === "too_large") {
      return Response.json({ error: "File too large" }, { status: 413 });
    }
    return Response.json({ error: "Unsupported image type" }, { status: 415 });
  }

  // Disk first, database second: if the database fails we only have a file nobody
  // points at, and we remove it. The other order could leave User.image pointing
  // at a file that does not exist.
  const relativePath = await saveAvatar(bytes, check.extension, UPLOADS_DIR);
  let saved: { avatarId: string; oldAvatars: { id: string; path: string }[] };
  try {
    // Pinned to READ COMMITTED (Postgres' default; the option at the end): each query
    // sees what was committed when it starts, which is how a waiting upload sees this one
    saved = await prisma.$transaction(async (tx) => {
      const record = await tx.avatar.create({
        data: { ownerId: user.id, mimeType: check.mimeType, sizeBytes: bytes.length, path: relativePath },
      });
      await tx.user.update({ where: { id: user.id }, data: { image: `/api/files/${record.id}` } });
      // One avatar per user (#23): every other one goes, not only older ones. The update
      // above locks the user's row until commit, so a parallel upload waits there and
      // then sees this avatar: the one that commits last keeps its own and User.image.
      // So an earlier upload may already have answered 201 with an id that is gone by
      // now: on purpose, the last upload wins, and User.image is what counts.
      const oldAvatars = await tx.avatar.findMany({
        where: { ownerId: user.id, id: { not: record.id } },
        select: { id: true, path: true },
      });
      // Usually there is none: skip the extra query while the user's row is locked
      if (oldAvatars.length > 0) {
        await tx.avatar.deleteMany({ where: { id: { in: oldAvatars.map((old) => old.id) } } });
      }
      return { avatarId: record.id, oldAvatars };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    try {
      await unlink(path.join(UPLOADS_DIR, relativePath));
    } catch (cleanupError) {
      // Only an orphan file is left: report it, but keep the database error
      console.error("Could not remove orphan upload", relativePath, cleanupError);
    }
    throw error;
  }

  // Files only after the commit: a rollback brings the rows back, but the disk has no
  // rollback. Rows first, files second: a failure here only leaves a file nobody points at.
  for (const old of saved.oldAvatars) {
    try {
      await unlink(path.join(UPLOADS_DIR, old.path));
    } catch (error) {
      // The new avatar is already in use: report the leftover, don't fail the upload.
      // With the path: the row is gone, so the id alone cannot find the file.
      // ENOENT is logged too: the row lock lets only one upload delete each old row,
      // so a missing file here means the disk had lost a file the database still had.
      console.error("Could not delete old avatar file", old.id, old.path, error);
    }
  }

  return Response.json({ id: saved.avatarId, url: `/api/files/${saved.avatarId}` }, { status: 201 });
}
