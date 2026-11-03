import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

// Deletes the user row; Postgres removes or detaches the rest through the
// onDelete rules (docs/gdpr/account-deletion-table.md)
export async function deleteAccount(userId: string, db: PrismaClient = prisma): Promise<void> {
  await db.user.delete({ where: { id: userId } });
}
