import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

export type ExportStatus = {
  status: "pending" | "ready" | "failed";
  expiresAt: Date | null;
};

// The status of one export, only if it belongs to userId
export async function getExportStatus(
  userId: string,
  exportId: string,
  db: PrismaClient = prisma,
): Promise<ExportStatus | null> {
  return db.dataExport.findFirst({
    where: { id: exportId, userId },
    select: { status: true, expiresAt: true },
  });
}
