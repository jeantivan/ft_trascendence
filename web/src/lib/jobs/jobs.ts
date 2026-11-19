import { purgeOldAuditRows } from "@/lib/gdpr/audit";
import { purgeExpiredOrganizations } from "@/lib/org/purge-expired-organizations";
import { prisma } from "@/lib/prisma";
import type { Job } from "./run-jobs";

// The cleanups that run on start and every 24 hours (#224). Each one is a promise
// of the Privacy Policy (section 7 / section 8). The expired data exports (#170) go here too
export const JOBS: readonly Job[] = [
  { name: "audit_log purge", run: () => purgeOldAuditRows(prisma, new Date()) },
  { name: "organization purge", run: () => purgeExpiredOrganizations(prisma, new Date()) },
];
