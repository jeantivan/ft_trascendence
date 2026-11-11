import { getAccount, listAccounts, type AccountDetail, type AccountsPage } from "@/lib/admin/accounts";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";

// Reads of the Admin panel (#102), for its pages; actions.ts has the forms.
// requireAdmin first, outside try/catch: it redirects or answers 403 by throwing

// ?page= comes from the address, so anyone can write anything there: only a whole
// number from 1 up counts, anything else (abc, -3, 2.5, repeated...) shows page 1
function pageFromParam(pageParam: string | string[] | undefined): number {
  return typeof pageParam === "string" && /^[1-9]\d*$/.test(pageParam) ? Number(pageParam) : 1;
}

export async function getAccountsPageForAdmin(pageParam: string | string[] | undefined): Promise<AccountsPage> {
  await requireAdmin();
  return listAccounts(prisma, { page: pageFromParam(pageParam) });
}

// null when the account does not exist or the id is malformed (the page shows a 404)
export async function getAccountForAdmin(accountId: string): Promise<AccountDetail | null> {
  await requireAdmin();
  return getAccount(prisma, accountId);
}
