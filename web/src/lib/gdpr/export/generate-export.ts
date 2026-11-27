import { createHash, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildExportFiles } from "@/lib/gdpr/export/build-export-files";
import { exportZipPath } from "@/lib/gdpr/export/export-zip-path";
import { createPrismaExportUserRepository } from "@/lib/gdpr/export/prisma-export-user-repository";
import { writeExportZip } from "@/lib/gdpr/export/write-export-zip";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

// The download link lasts 7 days (docs/gdpr/export-spec.md)
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GenerateExportResult =
  // token is the only copy of the secret: the database keeps its SHA-256 and nothing else
  | { ready: true; token: string }
  | { ready: false };

// Fills a pending export: writes the ZIP, then marks it ready with the hash of a new
// token. Never throws, because it runs after the 202 response (after()) and nobody could
// catch it: a failure marks the export failed and returns { ready: false }.
//
// The ZIP is complete before the row says ready (writeExportZip renames it only after
// closing it). Both updates require the row to still be pending: if requestExport replaced
// it meanwhile (a stuck pending is deleted), this generator lost and removes its own file.
export async function generateExport(
  exportId: string,
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
  now: Date = new Date(),
): Promise<GenerateExportResult> {
  const relativePath = exportZipPath(exportId);
  const destination = path.join(uploadsDir, relativePath);
  try {
    const row = await db.dataExport.findFirst({
      where: { id: exportId, status: "pending" },
      select: { userId: true },
    });
    if (row === null) return { ready: false };

    const files = await buildExportFiles(row.userId, createPrismaExportUserRepository(db), now);
    if (files === null) throw new Error("user not found");
    await writeExportZip(files, destination);

    const token = randomBytes(32).toString("base64url");
    const { count } = await db.dataExport.updateMany({
      where: { id: exportId, status: "pending" },
      data: {
        status: "ready",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        path: relativePath,
        expiresAt: new Date(now.getTime() + EXPORT_TTL_MS),
      },
    });
    if (count === 0) {
      await rm(destination, { force: true });
      return { ready: false };
    }
    return { ready: true, token };
  } catch (error) {
    // Only the error name: the message could carry an email or a path
    console.warn(`Export ${exportId} failed (${error instanceof Error ? error.name : "unknown"})`);
    await rm(destination, { force: true }).catch(() => {});
    await db.dataExport
      .updateMany({ where: { id: exportId, status: "pending" }, data: { status: "failed" } })
      .catch(() => {});
    return { ready: false };
  }
}
