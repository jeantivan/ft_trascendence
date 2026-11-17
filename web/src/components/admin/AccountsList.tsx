import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AccountSummary } from "@/lib/admin/accounts";
import { formatDate, globalRoleLabel } from "./format";

// The list of accounts in the Admin panel (#102), one page at a time
interface Props {
  accounts: AccountSummary[];
  page: number;
  hasNextPage: boolean;
}

export function AccountsList({ accounts, page, hasNextPage }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto p-0">
        {accounts.length === 0 ? (
          <p className="p-6 text-text-secondary">No hay cuentas en esta página.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Email</th>
                <th scope="col" className="px-4 py-3 font-medium">Nick</th>
                <th scope="col" className="px-4 py-3 font-medium">Rol</th>
                <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                <th scope="col" className="px-4 py-3 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/accounts/${account.id}`} className="font-medium hover:underline">
                      {account.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {account.nick ?? <span className="text-text-secondary">Sin nick</span>}
                  </td>
                  <td className="px-4 py-3">{globalRoleLabel(account.roleGlobal)}</td>
                  <td className="px-4 py-3">
                    {account.blockedAt && <Badge variant="warning">Bloqueada</Badge>}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(account.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {(page > 1 || hasNextPage) && (
        <nav aria-label="Páginas de cuentas" className="flex gap-2">
          {page > 1 && (
            <Button variant="ghost" href={`/admin/accounts?page=${page - 1}`}>
              Anterior
            </Button>
          )}
          {hasNextPage && (
            <Button variant="ghost" href={`/admin/accounts?page=${page + 1}`}>
              Siguiente
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
