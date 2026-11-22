import type { GlobalRole, MembershipRole, Prisma, PrismaClient } from "@/generated/prisma/client";
import { recordAdminAction, type AdminActionEntry } from "@/lib/gdpr/record-admin-action";
import { lockAccountAndAdmins } from "@/lib/admin/lock-account-and-admins";
import { deleteAccountAsAdmin } from "@/lib/gdpr/delete-account";
import { nickSchema } from "@/lib/auth/schemas";
import { isDbId } from "@/lib/permissions/is-db-id";

// Admin panel (#102, parent #50). Callers check the Admin first (requireAdmin):
// actions.ts for the forms and queries.ts for the pages. These functions trust
// the adminId they get and only apply the panel's rules.

// What the panel shows of an account: never passwordHash or totpSecret
export interface AccountSummary {
  id: string;
  email: string;
  nick: string | null;
  roleGlobal: GlobalRole;
  blockedAt: Date | null;
  createdAt: Date;
}

// select keeps secret columns out of memory, not just out of the result
const ACCOUNT_SUMMARY = {
  id: true,
  email: true,
  nick: true,
  roleGlobal: true,
  blockedAt: true,
  createdAt: true,
} as const;

export const ACCOUNTS_PAGE_SIZE = 50;

export interface AccountsPage {
  accounts: AccountSummary[];
  hasNextPage: boolean;
}

// Newest accounts first. Pages start at 1. One row more than the page tells
// whether there is a next page without counting the whole table
export async function listAccounts(
  db: PrismaClient,
  { page, pageSize = ACCOUNTS_PAGE_SIZE }: { page: number; pageSize?: number },
): Promise<AccountsPage> {
  const rows = await db.user.findMany({
    select: ACCOUNT_SUMMARY,
    // id breaks ties, so two accounts created in the same millisecond keep their place
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (Math.max(1, page) - 1) * pageSize,
    take: pageSize + 1,
  });
  return { accounts: rows.slice(0, pageSize), hasNextPage: rows.length > pageSize };
}

// An account's page in the panel: its fields and the clubs it belongs to.
// No training or health data: the Admin does not read RPE (CONTEXT.md)
export interface AccountDetail extends AccountSummary {
  clubs: { id: string; name: string; role: MembershipRole }[];
}

// null when the account does not exist
export async function getAccount(db: PrismaClient, accountId: string): Promise<AccountDetail | null> {
  if (!isDbId(accountId)) return null;
  const user = await db.user.findUnique({
    where: { id: accountId },
    select: {
      ...ACCOUNT_SUMMARY,
      memberships: {
        select: { role: true, organization: { select: { id: true, name: true } } },
        orderBy: { organization: { name: "asc" } },
      },
    },
  });
  if (!user) return null;
  const { memberships, ...summary } = user;
  return {
    ...summary,
    clubs: memberships.map(({ role, organization }) => ({ ...organization, role })),
  };
}

// What a guard can refuse with, inside changeAccount's transaction
type Refusal = "last-admin" | "club-manager";

// changed: false when the account was already like that (see changeAccount)
export type AccountActionResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not-found" | "self" | Refusal };

// The audit actions on an account, as record-admin-action.ts lists them
type AccountAuditAction = Extract<AdminActionEntry, { resource: "account" }>["action"];

interface AccountAction {
  adminId: string;
  accountId: string;
}

// The blocked person's next request no longer gets in: requireAuth reads blockedAt
// from the database on every request (#99)
export async function blockAccount(db: PrismaClient, { adminId, accountId }: AccountAction): Promise<AccountActionResult> {
  // Blocking yourself would lock you out of the panel. Compared in lowercase: a form
  // sent by hand can carry the id in upper case, and Postgres compares uuids by value
  if (accountId.toLowerCase() === adminId.toLowerCase()) return { ok: false, reason: "self" };
  return setBlocked(db, { adminId, accountId }, true);
}

export async function unblockAccount(db: PrismaClient, action: AccountAction): Promise<AccountActionResult> {
  return setBlocked(db, action, false);
}

async function setBlocked(
  db: PrismaClient,
  action: AccountAction,
  blocked: boolean,
): Promise<AccountActionResult> {
  if (!blocked) {
    // Unblocking needs no rule: it never leaves the app without an unblocked Admin
    return changeAccount(db, action, "unblock", {
      where: { blockedAt: { not: null } },
      data: { blockedAt: null },
    });
  }
  // Blocking an account that is already blocked keeps its first date: since when.
  // The last-Admin rule goes first (docs/adr/0004): there is always one unblocked Admin
  return changeAccount(
    db,
    action,
    "block",
    { where: { blockedAt: null }, data: { blockedAt: new Date() } },
    { guard: refuseLastAdmin },
  );
}

// Locks the account with every Admin (lockAccountAndAdmins, one ordered statement) and
// refuses when it is the last unblocked Admin. Read after the lock: two Admins blocking
// each other at once run one after the other, and the second one sees the first one's
// block. A missing account is left to changeAccount, which says not-found.
// It also locks for an account that is not an Admin: reading the role without the lock
// first would race with a role change (#103) between the read and the block
async function refuseLastAdmin(tx: Prisma.TransactionClient, accountId: string): Promise<Refusal | null> {
  const { isLastAdmin } = await lockAccountAndAdmins(tx, accountId);
  return isLastAdmin ? "last-admin" : null;
}

// The common part of every change the panel makes to an account: change it only
// if it is not like that already, and write the audit row in the same transaction.
// guard runs first, in that transaction, and refuses with its reason (the last-Admin
// rule for blocking and removing the Admin role, the Manager one for giving it). where narrows the account to the rows that would change; when
// none does, the account does not exist (not-found) or is already like that
// (changed: false, and no audit row, since nothing happened). So two Admins doing
// the same thing at once write one audit row, not two
async function changeAccount(
  db: PrismaClient,
  { adminId, accountId }: AccountAction,
  auditAction: AccountAuditAction,
  { where, data }: { where: Prisma.UserWhereInput; data: Prisma.UserUpdateManyMutationInput },
  { guard }: { guard?: (tx: Prisma.TransactionClient, accountId: string) => Promise<Refusal | null> } = {},
): Promise<AccountActionResult> {
  if (!isDbId(accountId)) return { ok: false, reason: "not-found" };
  return db.$transaction(async (tx) => {
    const refused = await guard?.(tx, accountId);
    if (refused) return { ok: false, reason: refused };
    const { count } = await tx.user.updateMany({ where: { ...where, id: accountId }, data });
    if (count === 0) {
      const exists = await tx.user.findUnique({ where: { id: accountId }, select: { id: true } });
      return exists ? { ok: true, changed: false } : { ok: false, reason: "not-found" };
    }
    // Ids only: what changed (a nick, say) never goes to audit_log
    await recordAdminAction(tx, { adminId, action: auditAction, resource: "account", subjectId: accountId });
    return { ok: true, changed: true };
  });
}

// Deletes another person's account (#104) with the same deletion as their own, without
// the email code (deleteAccountAsAdmin, #158): its rows, its avatar files and the notices.
// The delete row goes in beforeDelete, in the same transaction: if the deletion fails, it
// rolls back with it. So its order does not matter: beforeDelete writes it before the lock
// and the last-Admin rule, but a refused deletion leaves no row, and audit_log has no
// foreign key to users, so the write takes no lock on any account (docs/adr/0004)
export async function deleteAccount(db: PrismaClient, { adminId, accountId }: AccountAction): Promise<AccountActionResult> {
  // Compared in lowercase, like blockAccount: Postgres compares uuids by value
  if (accountId.toLowerCase() === adminId.toLowerCase()) return { ok: false, reason: "self" };
  // Before the database: a malformed id would make Postgres throw (22P02, a 500)
  if (!isDbId(accountId)) return { ok: false, reason: "not-found" };
  const result = await deleteAccountAsAdmin(
    accountId,
    (tx) => recordAdminAction(tx, { adminId, action: "delete", resource: "account", subjectId: accountId }),
    db,
  );
  if (result.deleted) return { ok: true, changed: true };
  return { ok: false, reason: result.reason === "last_admin" ? "last-admin" : "not-found" };
}

export type UpdateNickResult =
  | AccountActionResult
  | { ok: false; reason: "invalid-nick"; message: string };

// To moderate an offensive nick. The email cannot change: it is how the person
// signs in. Same rule as sign-up, taken from there so the two never differ
export async function updateAccountNick(
  db: PrismaClient,
  { adminId, accountId, nick }: AccountAction & { nick: string },
): Promise<UpdateNickResult> {
  const parsed = nickSchema.safeParse(nick);
  if (!parsed.success) {
    return { ok: false, reason: "invalid-nick", message: parsed.error.issues[0].message };
  }
  // nick: null needs its own case: in SQL, NULL <> 'x' is not true
  return changeAccount(db, { adminId, accountId }, "update", {
    where: { OR: [{ nick: null }, { NOT: { nick: parsed.data } }] },
    data: { nick: parsed.data },
  });
}

// Makes an account an Admin or a normal user (#103): Roles management in Advanced permissions
export async function changeGlobalRole(
  db: PrismaClient,
  { adminId, accountId, role }: AccountAction & { role: GlobalRole },
): Promise<AccountActionResult> {
  // Never on the own account, so the web is never left without its Admin. Compared in
  // lowercase, like blockAccount: Postgres compares uuids by value
  if (accountId.toLowerCase() === adminId.toLowerCase()) return { ok: false, reason: "self" };
  // Removing the role: the last-Admin rule goes first (docs/adr/0004). Giving it: no such
  // rule (an Admin more never leaves fewer), only the Manager one
  return changeAccount(
    db,
    { adminId, accountId },
    "role_change",
    { where: { roleGlobal: { not: role } }, data: { roleGlobal: role } },
    { guard: role === "admin" ? refuseClubManager : refuseLastAdmin },
  );
}

// An Admin is never a Manager of a club (CONTEXT.md, Admin; decided in #214): naming a Manager
// refuses the other way round. Read after lockAccountAndAdmins has locked the account
// FOR UPDATE: assignManager (lockUserThenClub) and createClub (lockUsersExist) lock the same
// row FOR NO KEY UPDATE, and the two conflict, so a Manager named at the same time waits for
// this commit and then sees the Admin, or this waits and sees the Manager. Its isLastAdmin is
// not used: giving the role cannot break it
async function refuseClubManager(tx: Prisma.TransactionClient, accountId: string): Promise<Refusal | null> {
  await lockAccountAndAdmins(tx, accountId);
  const manager = await tx.membership.findFirst({ where: { userId: accountId, role: "manager" }, select: { userId: true } });
  return manager ? "club-manager" : null;
}
