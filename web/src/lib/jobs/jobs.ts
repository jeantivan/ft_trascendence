import { purgeOldAuditRows } from "@/lib/gdpr/audit";
import { prisma } from "@/lib/prisma";
import type { Job } from "./run-jobs";

// The cleanups that run on start and every 24 hours (#224). Each one is a promise
// of the Privacy Policy (section 7). The expired data exports (#170) go here too
export const JOBS: readonly Job[] = [
  { name: "audit_log purge", run: () => purgeOldAuditRows(prisma, new Date()) },
];
