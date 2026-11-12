import { Prisma, type ActorRole, type AuditAction, type PrismaClient } from "@/generated/prisma/client";

// What the person does on their own behalf: no role, and never an access by a third party
const SELF_ACTIONS = ["consent_given", "consent_withdrawn", "account_deleted"] as const satisfies readonly AuditAction[];
type SelfAction = (typeof SELF_ACTIONS)[number];
// What a Manager may record on someone's data in their club. Which cases: the
// Manager column of matrix #2 (https://github.com/jeantivan/ft_trascendence/issues/2).
// Our reading, not the matrix's words: its C/R/U/D map to create/read/update/delete,
// and the Admin-only actions are left out
type ManagerAction = "read" | "update" | "create" | "delete";
// Everything else is the Admin's (#101). recordAdminAction's list must match it (checked by a test)
export type AdminAction = Exclude<AuditAction, SelfAction>;

// Audit metadata only. The table has no dedicated column for RPE values,
// Feedback bodies or message text. Never put sensitive content in any field;
// resource and resourceId must contain only resource names and identifiers.
// The role decides which actions fit, so a pair that makes no sense (a Manager
// with consent_given) does not compile (#183).
export type AuditEntry = {
  actorId: string;
  subjectId: string | null;
  resource: string;
  resourceId: string | null;
} & (
  | { actorRole: null; action: SelfAction }
  | { actorRole: "manager"; action: ManagerAction }
  | { actorRole: "admin"; action: AdminAction }
);

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
// Rows without an actor role, and SELF_ACTIONS even if a row has a role, are not
// accesses by a third party (#183).
// This function does not authorize access to subjectId.
// For self-export (#33), the caller must derive it from the authenticated
// session and validate the current user in the database, never trust a
// subjectId supplied by the client.
export async function listAccessesToUser(db: PrismaClient, subjectId: string): Promise<AccessLogEntry[]> {
  const rows = await db.auditLog.findMany({
    where: { subjectId, actorRole: { not: null }, action: { notIn: [...SELF_ACTIONS] } },
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
