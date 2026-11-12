import type { Prisma } from "@/generated/prisma/client";
import { recordAudit, type AdminAction } from "./audit";

// The audit actions an Admin can take (#101). What each one means is in
// AuditAction in schema.prisma. It is every AuditAction except SELF_ACTIONS (audit.ts):
// AdminAction there, and a test checks that this list matches it.
export const ADMIN_AUDIT_ACTIONS = [
  "block",
  "unblock",
  "role_change",
  "delete",
  "create",
  "update",
  "read",
] as const satisfies readonly AdminAction[];

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

// Each resource only takes the actions the Admin can do on it (matrix #2): any
// other pair would show up as nonsense in the access_log of the person's data
// export (#36).

// An action on a person: subjectId is required, because the data export (#36)
// finds "what the Admin did to me" by subject_id.
interface AccountEntry {
  action: "block" | "unblock" | "update" | "role_change" | "delete";
  resource: "account";
  subjectId: string;
  resourceId?: string;
}

// A membership: the Admin gives or removes the Manager role, or expels a member.
interface MembershipEntry {
  action: "role_change" | "delete";
  resource: "membership";
  subjectId: string;
  resourceId?: string;
}

// A reported message, the only thing the Admin reads: its author is the person,
// and resourceId says which message.
interface MessageEntry {
  action: "read" | "delete";
  resource: "message";
  subjectId: string;
  resourceId: string;
}

// A club. Creating one with its first Manager writes two rows: create on
// organization, and role_change on membership with the Manager as subjectId.
// No subjectId here: a club is not a person, and the row would reach someone's export.
interface OrganizationEntry {
  action: "create" | "update" | "delete";
  resource: "organization";
  resourceId: string;
  subjectId?: never;
}

// A Group or an Event of a club: the Admin can only delete them. No subjectId either.
interface ContentEntry {
  action: "delete";
  resource: "group" | "event";
  resourceId: string;
  subjectId?: never;
}

export type AdminActionEntry = { adminId: string } & (
  | AccountEntry
  | MembershipEntry
  | MessageEntry
  | OrganizationEntry
  | ContentEntry
);

// Writes the audit_log row of an Admin action. Call it with the tx of the action
// itself and only when the request entered as Admin (requireAdmin, or role
// "admin" from requireOrgRole): if the action fails, the row rolls back with it.
// A Manager's action is not recorded here: it goes with actor_role manager (#163).
// Ids only, never the content (nick, message text...): the row is kept 12 months.
// A thin layer over recordAudit, the one writer of audit_log (#183): it fixes the
// role to admin and only lets through the Admin's own resource and action pairs.
export async function recordAdminAction(
  tx: Prisma.TransactionClient,
  entry: AdminActionEntry,
): Promise<void> {
  await recordAudit(tx, {
    actorId: entry.adminId,
    actorRole: "admin",
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId ?? null,
    subjectId: entry.subjectId ?? null,
  });
}
