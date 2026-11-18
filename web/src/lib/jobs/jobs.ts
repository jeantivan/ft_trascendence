import { purgeOldAuditRows } from "@/lib/gdpr/audit";
import { prisma } from "@/lib/prisma";
import { sweepOrphanAvatars } from "@/lib/uploads/sweep-orphan-avatars";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";
import type { Job } from "./run-jobs";

// The cleanups that run on start and every 24 hours (#224). Each one is a promise
// of the Privacy Policy: the audit_log purge, section 7; the orphan avatar sweep,
// section 8 (a deleted account takes its photo with it, #254). The expired data
// exports (#170) go here too
export const JOBS: readonly Job[] = [
  { name: "audit_log purge", run: () => purgeOldAuditRows(prisma, new Date()) },
  { name: "orphan avatar sweep", run: () => sweepOrphanAvatars(prisma, UPLOADS_DIR, new Date()) },
];
