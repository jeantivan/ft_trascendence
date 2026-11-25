import { purgeOldAuditRows } from "@/lib/gdpr/audit";
import { purgeExpiredExports } from "@/lib/gdpr/export/purge-expired-exports";
import { purgeExpiredOrganizations } from "@/lib/org/purge-expired-organizations";
import { prisma } from "@/lib/prisma";
import { sweepOrphanAvatars } from "@/lib/uploads/sweep-orphan-avatars";
import { UPLOADS_DIR } from "@/lib/uploads/uploads-dir";
import type { Job } from "./run-jobs";

// The cleanups that run on start and every 24 hours (#224). Each one is a promise
// of the Privacy Policy: the audit_log purge, section 7; the orphan avatar sweep,
// section 8 (a deleted account takes its photo with it, #254); the expired data exports,
// section 9 (the link and the ZIP last 7 days, #170).
export const JOBS: readonly Job[] = [
  { name: "audit_log purge", run: () => purgeOldAuditRows(prisma, new Date()) },
  { name: "orphan avatar sweep", run: () => sweepOrphanAvatars(prisma, UPLOADS_DIR, new Date()) },
  { name: "organization purge", run: () => purgeExpiredOrganizations(prisma, new Date()) },
  { name: "export purge", run: () => purgeExpiredExports(prisma, UPLOADS_DIR, new Date()) },
];
