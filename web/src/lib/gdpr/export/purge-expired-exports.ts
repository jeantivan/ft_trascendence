import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { EXPORTS_DIR, exportZipPath } from "@/lib/gdpr/export/export-zip-path";
import { EXPORT_TTL_MS } from "@/lib/gdpr/export/generate-export";
import { STUCK_PENDING_MS } from "@/lib/gdpr/export/request-export";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";

// A file without a row may belong to a generator still running (an account deleted
// mid-generation), so it is only removed once it is older than this
const ORPHAN_GRACE_MS = 10 * 60 * 1000;
const EXPORT_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.zip(\.tmp)?$/;

// Periodic cleanup of the exports (#170). Returns how many rows and files it removed.
// 1. Rows past their expiry, failed ones (they have no expiry date) older than EXPORT_TTL_MS and pending ones stuck for
//    more than STUCK_PENDING_MS. For ready and failed rows the ZIP goes first, then the row: if the
//    ZIP cannot be removed the row stays, so the next run retries (the download is already
//    refused by expiresAt, whatever this job does). For pending rows the row goes first, with
//    its status in the condition: a generation that finishes in between turns the row into
//    ready, and removing the ZIP before that would leave a ready row whose link answers 404.
//    Leftover files of a deleted pending row are removed by step 2.
// 2. ZIPs and .tmp files with no row at all (see Known limit in delete-account.ts).
// Known limit: one app process, like cleanupInterruptedExports. A generation that really
// lasts more than STUCK_PENDING_MS loses its row (requestExport already treats it as stuck).
export async function purgeExpiredExports(
  db: PrismaClient = prisma,
  uploadsDir: string = UPLOADS_DIR,
  now: Date = new Date(),
): Promise<number> {
  const stale = await db.dataExport.findMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { status: "failed", createdAt: { lt: new Date(now.getTime() - EXPORT_TTL_MS) } },
        { status: "pending", createdAt: { lt: new Date(now.getTime() - STUCK_PENDING_MS) } },
      ],
    },
    select: { id: true, status: true },
  });

  let removed = 0;
  for (const row of stale) {
    if (row.status === "pending") {
      const { count } = await db.dataExport.deleteMany({ where: { id: row.id, status: "pending" } });
      if (count === 0) continue;
      removed += count;
      await removeExportFiles(uploadsDir, row.id).catch((error) => {
        console.warn(`Export ${row.id}: files not removed, the orphan sweep will retry (${errorName(error)})`);
      });
      continue;
    }
    try {
      await removeExportFiles(uploadsDir, row.id);
    } catch (error) {
      console.warn(`Export ${row.id}: ZIP not removed, will retry (${errorName(error)})`);
      continue;
    }
    // The status is part of the condition: a row that changed meanwhile is left alone
    const { count } = await db.dataExport.deleteMany({ where: { id: row.id, status: row.status } });
    removed += count;
  }

  return removed + (await removeOrphanFiles(db, path.join(uploadsDir, EXPORTS_DIR), now));
}

async function removeExportFiles(uploadsDir: string, id: string): Promise<void> {
  await rm(path.join(uploadsDir, exportZipPath(id)), { force: true });
  await rm(path.join(uploadsDir, `${exportZipPath(id)}.tmp`), { force: true });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

async function removeOrphanFiles(db: PrismaClient, exportsDir: string, now: Date): Promise<number> {
  // Only a missing folder is normal; any other error is left to the job runner to log
  const files = await readdir(exportsDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const candidates = files.flatMap((file) => {
    const match = EXPORT_FILE.exec(file);
    return match === null ? [] : [{ file, id: match[1] }];
  });
  if (candidates.length === 0) return 0;

  const rows = await db.dataExport.findMany({
    where: { id: { in: candidates.map((candidate) => candidate.id) } },
    select: { id: true },
  });
  const withRow = new Set(rows.map((row) => row.id));

  let removed = 0;
  for (const { file, id } of candidates) {
    if (withRow.has(id)) continue;
    const filePath = path.join(exportsDir, file);
    try {
      const { mtimeMs } = await stat(filePath);
      if (now.getTime() - mtimeMs < ORPHAN_GRACE_MS) continue;
      await rm(filePath, { force: true });
      removed += 1;
    } catch (error) {
      console.warn(`Export file of ${id} not removed (${errorName(error)})`);
    }
  }
  return removed;
}
