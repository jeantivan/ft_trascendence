import { AccountsList } from "@/components/admin/AccountsList";
import { DELETED_NOTICE } from "@/components/admin/result-message";
import { Alert } from "@/components/ui/Alert";
import { getAccountsPageForAdmin } from "@/lib/admin/queries";

// Admin panel (#102): every account, 50 per page. getAccountsPageForAdmin checks the
// Admin first, so anyone else gets a 404 (#199). ?deleted=1: the account page's delete
// action brought the Admin back here (#104), so the list says it was deleted
export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; deleted?: string | string[] }>;
}) {
  const { page: pageParam, deleted } = await searchParams;
  const { accounts, hasNextPage, page } = await getAccountsPageForAdmin(pageParam);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">Cuentas</h1>
      {deleted === "1" && <Alert variant="success">{DELETED_NOTICE}</Alert>}
      <AccountsList accounts={accounts} page={page} hasNextPage={hasNextPage} />
    </div>
  );
}
