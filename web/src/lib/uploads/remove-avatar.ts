import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteAvatarFile } from "@/lib/uploads/delete-avatar-file";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

export type RemoveAvatarResult = {
  removed: true;
  avatarCleanupFailed?: number;
};

async function defaultDeleteAvatarFiles(paths: string[], uploadsDir: string): Promise<string[]> {
  const failed: string[] = [];
  for (const relativePath of paths) {
    try {
      await deleteAvatarFile(relativePath, uploadsDir);
    } catch {
      failed.push(relativePath);
    }
  }
  return failed;
}

// Removes the user's avatar in one transaction, then removes the physical files
// after commit (#130). Locks the user row (FOR UPDATE) before querying avatars
// to prevent race conditions with a parallel upload (POST /api/upload) or account deletion.
export async function removeAvatar(
  userId: string,
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
  deleteFiles: (paths: string[], dir: string) => Promise<string[]> = defaultDeleteAvatarFiles,
): Promise<RemoveAvatarResult> {
  let avatarPaths: string[] = [];

  await db.$transaction(
    async (tx) => {
      const lockedUsers = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (lockedUsers.length === 0) {
        // Account was deleted while waiting for the lock: exit cleanly (#184)
        return;
      }
      const avatars = await tx.avatar.findMany({
        where: { ownerId: userId },
        select: { path: true },
      });
      avatarPaths = avatars.map((a) => a.path);
      if (avatarPaths.length > 0) {
        await tx.avatar.deleteMany({ where: { ownerId: userId } });
      }
      await tx.user.update({
        where: { id: userId },
        data: { image: null },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  const failedPaths = await deleteFiles(avatarPaths, uploadsDir);
  if (failedPaths.length === 0) {
    return { removed: true };
  }
  console.warn(
    `Avatar removed, but ${failedPaths.length} file(s) could not be deleted: ${failedPaths.join(", ")}`,
  );
  return { removed: true, avatarCleanupFailed: failedPaths.length };
}
