// Writes an avatar to the uploads volume (#23). The name is a fresh UUID, never the
// client's file name, so nobody can choose where the file lands (../../ etc.).

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImageCheck } from "@/lib/uploads/check-image";

// The extension of an accepted image: "png" | "jpg" | "webp"
type ImageExtension = Extract<ImageCheck, { ok: true }>["extension"];

// Returns the path relative to uploadsDir (what File.path stores), e.g. avatars/<uuid>.png
export async function saveAvatar(
  bytes: Uint8Array,
  extension: ImageExtension,
  uploadsDir: string,
): Promise<string> {
  const relativePath = path.join("avatars", `${randomUUID()}.${extension}`);
  await mkdir(path.join(uploadsDir, "avatars"), { recursive: true });
  await writeFile(path.join(uploadsDir, relativePath), bytes);
  return relativePath;
}
