import { getAccount, listAccounts, type AccountDetail, type AccountsPage } from "@/lib/admin/accounts";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";

// Reads of the Admin panel (#102), for its pages; actions.ts has the forms.
// requireAdmin first, outside try/catch: it redirects or answers 404 by throwing (#199)

// ?page= comes from the address, so anyone can write anything there: only a whole
// number from 1 to 999999 counts, anything else (abc, -3, 2.5, repeated, too many
// digits...) shows page 1. The limit keeps the database's OFFSET in range: a 20-digit
// page gave a 500. 999999 pages of 50 are 50 million accounts
function pageFromParam(pageParam: string | string[] | undefined): number {
  return typeof pageParam === "string" && /^[1-9]\d{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
}

// With the page it shows, so the page can build its previous and next links
export async function getAccountsPageForAdmin(
  pageParam: string | string[] | undefined,
): Promise<AccountsPage & { page: number }> {
  await requireAdmin();
  const page = pageFromParam(pageParam);
  return { ...(await listAccounts(prisma, { page })), page };
}

// null when the account does not exist or the id is malformed (the page shows a 404).
// isSelf: the Admin's own account, which the page does not offer to block
export async function getAccountForAdmin(
  accountId: string,
): Promise<(AccountDetail & { isSelf: boolean }) | null> {
  const admin = await requireAdmin();
  const account = await getAccount(prisma, accountId);
  return account && { ...account, isSelf: account.id === admin.id };
}
