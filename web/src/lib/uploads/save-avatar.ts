// Writes an avatar to the uploads volume (#23). The name is a fresh UUID, never the
// client's file name, so nobody can choose where the file lands (../../ etc.).

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImageCheck } from "@/lib/uploads/check-image";

// The extension of an accepted image: "png" | "jpg" | "webp"
type ImageExtension = Extract<ImageCheck, { ok: true }>["extension"];

// Returns the path relative to uploadsDir (what Avatar.path stores), e.g. avatars/<uuid>.png
export async function saveAvatar(
  bytes: Uint8Array,
  extension: ImageExtension,
  uploadsDir: string,
): Promise<string> {
  const relativePath = path.join("avatars", `${randomUUID()}.${extension}`);
  const fullPath = path.join(uploadsDir, relativePath);
  await mkdir(path.join(uploadsDir, "avatars"), { recursive: true });
  try {
    await writeFile(fullPath, bytes);
  } catch (error) {
    // A failed write (full disk...) can leave part of the file, and no Avatar row will
    // ever point at it. A failed unlink is only logged: the write error is the real
    // cause, and it is the one we rethrow. ENOENT is not logged: no file, nothing left.
    await unlink(fullPath).catch((cleanupError: NodeJS.ErrnoException) => {
      if (cleanupError.code !== "ENOENT") {
        console.error("Could not remove partial upload", relativePath, cleanupError);
      }
    });
    throw error;
  }
  return relativePath;
}
