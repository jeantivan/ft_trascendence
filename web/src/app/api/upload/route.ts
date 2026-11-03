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
  // Content-Length is only the client's claim; checkImage checks the real size.
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) {
    return Response.json({ error: "Content-Length required" }, { status: 411 });
  }
  if (Number(contentLength) > MAX_IMAGE_BYTES + FORM_OVERHEAD_BYTES) {
    return Response.json({ error: "File too large" }, { status: 413 });
  }

  const form = await request.formData();
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
  let avatar: { id: string; createdAt: Date };
  try {
    avatar = await prisma.$transaction(async (tx) => {
      const record = await tx.avatar.create({
        data: { ownerId: user.id, mimeType: check.mimeType, sizeBytes: bytes.length, path: relativePath },
      });
      await tx.user.update({ where: { id: user.id }, data: { image: `/api/files/${record.id}` } });
      return record;
    });
  } catch (error) {
    try {
      await unlink(path.join(UPLOADS_DIR, relativePath));
    } catch (cleanupError) {
      // Only an orphan file is left: report it, but keep the database error
      console.error("Could not remove orphan upload", relativePath, cleanupError);
    }
    throw error;
  }

  // One avatar per user (#23). Only now that the new one is saved: if anything above
  // failed, the user keeps the old one. Only older ones, so an upload saved later
  // is not deleted. Row first: a failure then leaves a file nobody points at.
  const oldAvatars = await prisma.avatar.findMany({
    where: { ownerId: user.id, createdAt: { lt: avatar.createdAt } },
    select: { id: true, path: true },
  });
  for (const old of oldAvatars) {
    try {
      await prisma.avatar.delete({ where: { id: old.id } });
      await unlink(path.join(UPLOADS_DIR, old.path));
    } catch (error) {
      // The new avatar is already in use: report the leftover, don't fail the upload
      console.error("Could not delete old avatar", old.id, error);
    }
  }

  return Response.json({ id: avatar.id, url: `/api/files/${avatar.id}` }, { status: 201 });
}
