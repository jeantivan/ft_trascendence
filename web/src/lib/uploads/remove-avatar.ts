import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteAvatarFiles } from "@/lib/uploads/delete-avatar-files";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

export type RemoveAvatarResult = {
  removed: true;
  avatarCleanupFailed?: number;
};

// Removes the user's avatar in one transaction, then removes the physical files
// after commit (#130). Locks the user row (FOR UPDATE) before querying avatars
// to prevent race conditions with a parallel upload (POST /api/upload) or account deletion.
export async function removeAvatar(
  userId: string,
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
  deleteFiles: (paths: string[], dir: string) => Promise<number> = deleteAvatarFiles,
): Promise<RemoveAvatarResult> {
  let avatarPaths: string[] = [];

  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
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

  const failed = await deleteFiles(avatarPaths, uploadsDir);
  if (failed === 0) {
    return { removed: true };
  }
  console.warn(`Avatar removed, but ${failed} file(s) could not be deleted`);
  return { removed: true, avatarCleanupFailed: failed };
}
