import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

// Runs once when the server starts. The ZIP is generated inside the app process
// (after() in POST /api/gdpr/export), so a pending export found at startup lost its
// generator when the previous process died. Marking it failed lets the user ask again
// at once instead of waiting for STUCK_PENDING_MS, and removes what it left on disk:
// the .tmp of a half-written ZIP, and a complete ZIP the row never claimed (killed
// between the rename and the update to ready).
// Known limit: one app process. A second one starting would fail the first one's exports.
export async function cleanupInterruptedExports(
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
): Promise<void> {
  const interrupted = await db.dataExport.findMany({ where: { status: "pending" }, select: { id: true } });
  await db.dataExport.updateMany({
    where: { id: { in: interrupted.map((row) => row.id) }, status: "pending" },
    data: { status: "failed" },
  });

  const exportsDir = path.join(uploadsDir, "exports");
  const files = await readdir(exportsDir).catch(() => []);
  const interruptedFiles = new Set(interrupted.map((row) => `${row.id}.zip`));
  for (const file of files) {
    if (file.endsWith(".tmp") || interruptedFiles.has(file)) {
      await rm(path.join(exportsDir, file), { force: true });
    }
  }
}
