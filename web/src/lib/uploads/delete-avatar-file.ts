import { unlink } from "node:fs/promises";
import path from "node:path";

// relativePath comes from the database (Avatar.path), so it is checked before
// deleting: it must resolve to a file inside uploadsDir. A file that is already
// gone is not an error; any other failure is thrown for the caller to log.
export async function deleteAvatarFile(relativePath: string, uploadsDir: string): Promise<void> {
  // The contract is a relative path: an absolute one is refused even if it
  // happens to point inside uploadsDir
  if (path.isAbsolute(relativePath)) {
    throw new Error("Avatar path must be relative");
  }
  const root = path.resolve(uploadsDir);
  const target = path.resolve(root, relativePath);
  const fromRoot = path.relative(root, target);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error("Avatar path escapes the uploads directory");
  }

  try {
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
