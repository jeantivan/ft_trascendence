import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { deleteAvatarFiles } from "./delete-avatar-files";

// An upload writes its file before committing its Avatar row (POST /api/upload), so a
// recent file with no row may be an upload in progress. Only older files are orphans.
// Paths are never reused (a new UUID per file): an older file with no row never gets one
const MARGIN_MS = 10 * 60 * 1000;

// Deletes the avatar files that no Avatar row points to and that are more than
// MARGIN_MS old (#254). It never deletes a row, so it never leaves a broken photo.
// Returns how many orphans are gone after it (a file someone else deleted in the
// meantime counts too: deleteAvatarFile takes "already gone" as deleted).
// Known limit: one app process. Two processes sweeping at once do not coordinate
// (one instance, #238), as in cleanupInterruptedExports
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

  // A file that cannot be read or deleted does not stop the others: it stays for the
  // next run. Never rethrown: the error carries the path, and runJobs would log it
  let failed = 0;
  const oldFiles: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // Same form as Avatar.path: relative to uploadsDir
    const relativePath = path.join("avatars", entry.name);
    let modified: Date;
    try {
      modified = (await stat(path.join(uploadsDir, relativePath))).mtime;
    } catch (error) {
      // Gone since readdir (removeAvatar or an account deletion meanwhile): nothing to do
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed++;
      continue;
    }
    if (now.getTime() - modified.getTime() > MARGIN_MS) oldFiles.push(relativePath);
  }

  // Every row: Avatar.path has no index, and almost every file in the folder has a row
  const avatars = await db.avatar.findMany({ select: { path: true } });
  const pointed = new Set(avatars.map((avatar) => avatar.path));
  const orphans = oldFiles.filter((relativePath) => !pointed.has(relativePath));

  // Keeps going when one fails and returns how many it could not delete
  const notDeleted = await deleteAvatarFiles(orphans, uploadsDir);
  failed += notDeleted;
  // Only the count. runJobs logs the deleted ones
  if (failed > 0) console.warn(`Orphan avatar sweep: ${failed} file(s) could not be removed`);
  return orphans.length - notDeleted;
}
