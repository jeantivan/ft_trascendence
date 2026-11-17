import { AccountsList } from "@/components/admin/AccountsList";
import { getAccountsPageForAdmin } from "@/lib/admin/queries";

// Admin panel (#102): every account, 50 per page. getAccountsPageForAdmin checks the
// Admin first, so anyone else gets a 404 (#199)
export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page: pageParam } = await searchParams;
  const { accounts, hasNextPage, page } = await getAccountsPageForAdmin(pageParam);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">Cuentas</h1>
      <AccountsList accounts={accounts} page={page} hasNextPage={hasNextPage} />
    </div>
  );
}
