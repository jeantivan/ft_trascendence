import { deleteAvatarFile } from "./delete-avatar-file";

// Deletes the avatar files of a deleted account (#34). relativePaths are Avatar.path
// values (e.g. avatars/<uuid>.png).
//
// Returns how many files could NOT be deleted (0 = clean). Never throws and never
// logs, so no path or raw error leaks here: the caller decides what to log.
// Path validation and "already gone is clean" are deleteAvatarFile's job.
export async function deleteAvatarFiles(relativePaths: string[], uploadsDir: string): Promise<number> {
  let failed = 0;
  for (const relativePath of relativePaths) {
    try {
      await deleteAvatarFile(relativePath, uploadsDir);
    } catch {
      failed++;
    }
  }
  return failed;
}
