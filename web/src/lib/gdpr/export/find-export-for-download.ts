import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

// The ZIP of one export, only if every check passes: it belongs to userId, it is ready,
// it has not expired and the token matches. Returns its path (relative to the uploads
// directory) or null; the caller answers the same 404 for every reason, so nobody can
// tell a wrong token from someone else's export or an expired one (#165).
export async function findExportForDownload(
  userId: string,
  exportId: string,
  token: string,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<string | null> {
  const row = await db.dataExport.findFirst({
    where: { id: exportId, userId, status: "ready", expiresAt: { gt: now } },
    select: { tokenHash: true, path: true },
  });
  if (row === null || row.tokenHash === null || row.path === null) return null;

  // Both are SHA-256 hex (64 characters), so the buffers have the same length
  const expected = Buffer.from(row.tokenHash, "hex");
  const received = createHash("sha256").update(token).digest();
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return row.path;
}
