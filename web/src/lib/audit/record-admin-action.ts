import type { AuditAction, Prisma } from "@/generated/prisma/client";

// The audit actions an Admin can take (#101). What each one means is in
// AuditAction in schema.prisma; the person's own actions (consent, account_deleted)
// are left out.
export const ADMIN_AUDIT_ACTIONS = [
  "block",
  "unblock",
  "role_change",
  "delete",
  "create",
  "update",
  "read",
] as const satisfies readonly AuditAction[];

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

// An action that is about a person: subjectId is required, because the person's
// data export (#36) finds "what the Admin did to me" by subject_id. For a
// message, the person is its author (an Admin reading or deleting a reported one)
interface PersonEntry {
  resource: "account" | "membership" | "message";
  subjectId: string;
  resourceId?: string;
}

// An action on a club or its content: resourceId says which one.
// Creating a club with its first Manager writes two rows: create on
// organization, and role_change on membership with the Manager as subjectId.
interface ContentEntry {
  resource: "organization" | "group" | "event";
  resourceId: string;
  subjectId?: string;
}

export type AdminActionEntry = { adminId: string; action: AdminAuditAction } & (
  | PersonEntry
  | ContentEntry
);

// Writes the audit_log row of an Admin action. Call it with the tx of the action
// itself and only when the request entered as Admin (requireAdmin, or role
// "admin" from requireOrgRole): if the action fails, the row rolls back with it.
// Ids only, never the content (nick, message text...): the row is kept 12 months.
export async function recordAdminAction(
  tx: Prisma.TransactionClient,
  entry: AdminActionEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.adminId,
      actorRole: "admin",
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      subjectId: entry.subjectId ?? null,
    },
  });
}
