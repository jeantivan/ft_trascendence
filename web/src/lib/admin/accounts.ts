import type { GlobalRole, MembershipRole, Prisma, PrismaClient } from "@/generated/prisma/client";
import { recordAdminAction, type AdminActionEntry } from "@/lib/gdpr/record-admin-action";
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

// changed: false when the account was already like that (see changeAccount)
export type AccountActionResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not-found" | "self" | "admin" };

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

// Blocking is refused for an Admin account that is not blocked yet, until the last-Admin
// rule arrives (#102, with lockAccountAndAdmins from #158): two Admins blocking each
// other at once would leave the app with none. An Admin that is already blocked is not
// refused: it is already as the Admin wanted. The one place for this rule: setBlocked
// refuses with it and the account page hides the block button with it (its where
// below says the same in Prisma terms)
export function isBlockRefusedForAdmin(account: { roleGlobal: GlobalRole; blockedAt: Date | null }): boolean {
  return account.roleGlobal === "admin" && account.blockedAt === null;
}

async function setBlocked(
  db: PrismaClient,
  action: AccountAction,
  blocked: boolean,
): Promise<AccountActionResult> {
  if (!blocked) {
    // Unblocking an Admin is still allowed: one blocked before the rule below must get back in
    return changeAccount(db, action, "unblock", {
      where: { blockedAt: { not: null } },
      data: { blockedAt: null },
    });
  }
  // Blocking an account that is already blocked keeps its first date: since when.
  // Admins: see isBlockRefusedForAdmin. The role is also part of where (keep the two in
  // step), so an account made Admin in the meantime is refused too
  return changeAccount(
    db,
    action,
    "block",
    { where: { blockedAt: null, roleGlobal: { not: "admin" } }, data: { blockedAt: new Date() } },
    { refuse: (account) => (isBlockRefusedForAdmin(account) ? "admin" : null) },
  );
}

// The account as it is when nothing changed, for refuse to tell why
type UnchangedAccount = { roleGlobal: GlobalRole; blockedAt: Date | null };

// The common part of every change the panel makes to an account: change it only
// if it is not like that already, and write the audit row in the same transaction.
// where narrows the account to the rows that would change; when none does, the
// account does not exist (not-found), is refused for a reason refuse gives (an
// Admin, for blocking), or is already like that (changed: false, and no audit row,
// since nothing happened). So two Admins doing the same thing at once write one
// audit row, not two
async function changeAccount(
  db: PrismaClient,
  { adminId, accountId }: AccountAction,
  auditAction: AccountAuditAction,
  { where, data }: { where: Prisma.UserWhereInput; data: Prisma.UserUpdateManyMutationInput },
  { refuse }: { refuse?: (account: UnchangedAccount) => "admin" | null } = {},
): Promise<AccountActionResult> {
  if (!isDbId(accountId)) return { ok: false, reason: "not-found" };
  return db.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { ...where, id: accountId }, data });
    if (count === 0) {
      const account = await tx.user.findUnique({
        where: { id: accountId },
        select: { roleGlobal: true, blockedAt: true },
      });
      if (!account) return { ok: false, reason: "not-found" };
      const reason = refuse?.(account);
      return reason ? { ok: false, reason } : { ok: true, changed: false };
    }
    // Ids only: what changed (a nick, say) never goes to audit_log
    await recordAdminAction(tx, { adminId, action: auditAction, resource: "account", subjectId: accountId });
    return { ok: true, changed: true };
  });
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
