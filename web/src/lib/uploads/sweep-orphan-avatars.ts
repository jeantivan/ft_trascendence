import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { deleteAvatarFile } from "./delete-avatar-file";

// An upload writes its file before committing its Avatar row (POST /api/upload), so a
// recent file with no row may be an upload in progress. Only older files are orphans.
// Paths are never reused (a new UUID per file): an older file with no row never gets one
const MARGIN_MS = 10 * 60 * 1000;

// Deletes the avatar files that no Avatar row points to and that are more than
// MARGIN_MS old (#254). It never deletes a row, so it never leaves a broken photo.
// Returns how many files it deleted
export async function sweepOrphanAvatars(db: PrismaClient, uploadsDir: string, now: Date): Promise<number> {
  // Disk first, then the database: with no avatars/ the database is not even asked
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(uploadsDir, "avatars"), { withFileTypes: true });
  } catch (error) {
    // saveAvatar creates avatars/ with the first upload: none yet, nothing to sweep.
    // Any other error (EACCES...) is real: runJobs logs it
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const oldFiles: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // Same form as Avatar.path: relative to uploadsDir
    const relativePath = path.join("avatars", entry.name);
    const { mtime } = await stat(path.join(uploadsDir, relativePath));
    if (now.getTime() - mtime.getTime() > MARGIN_MS) oldFiles.push(relativePath);
  }

  // Every row: Avatar.path has no index, and almost every file in the folder has a row
  const avatars = await db.avatar.findMany({ select: { path: true } });
  const pointed = new Set(avatars.map((avatar) => avatar.path));

  let removed = 0;
  for (const relativePath of oldFiles) {
    if (pointed.has(relativePath)) continue;
    await deleteAvatarFile(relativePath, uploadsDir);
    removed++;
  }
  return removed;
}
