import { Prisma, type ActorRole, type AuditAction, type PrismaClient } from "@/generated/prisma/client";

// One audit_log row. There is no field for the data itself (RPE value, Feedback
// body, message text): the type makes it impossible to pass one by mistake
export type AuditEntry = {
  actorId: string;
  subjectId: string | null;
  // Null in consent events and account deletion: the person acts on their own behalf
  actorRole: ActorRole | null;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
};

// Takes the caller's transaction, so the row is committed or rolled back together
// with the change it records
export async function recordAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: entry });
}

const RETENTION_MONTHS = 12;

// Deletes the rows older than 12 months and returns how many it removed.
// "now" is a parameter so a test can fix the date instead of depending on the clock
export async function purgeOldAuditRows(db: PrismaClient, now: Date): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

// The four fields of access_log in the export (docs/gdpr/export-spec.md). No actor_id
export type AccessLogEntry = {
  created_at: string;
  action: AuditAction;
  resource: string;
  actor_role: ActorRole;
};

// Accesses by a Manager or an Admin to the data of subjectId, oldest first.
// Rows without an actor role (consent events, account_deleted) are not accesses by a third party
export async function listAccessesToUser(db: PrismaClient, subjectId: string): Promise<AccessLogEntry[]> {
  const rows = await db.auditLog.findMany({
    where: { subjectId, actorRole: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, action: true, resource: true, actorRole: true },
  });

  const entries: AccessLogEntry[] = [];
  for (const row of rows) {
    // The query already left out the nulls: this check is for the type checker
    if (row.actorRole === null) {
      continue;
    }
    entries.push({
      created_at: row.createdAt.toISOString(),
      action: row.action,
      resource: row.resource,
      actor_role: row.actorRole,
    });
  }
  return entries;
}
