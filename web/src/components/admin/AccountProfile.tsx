import { Card } from "@/components/ui/Card";
import type { AccountDetail } from "@/lib/admin/accounts";
import { clubRoleLabel, formatDate, globalRoleLabel } from "./format";

// One account in the Admin panel (#102): its fields and its clubs.
// No training or health data: the Admin does not read RPE (CONTEXT.md)
export function AccountProfile({ account }: { account: AccountDetail }) {
  return (
    <Card as="section" aria-labelledby="account-email" className="flex flex-col gap-6">
      <h2 id="account-email" className="font-heading text-xl font-semibold break-all">
        {account.email}
      </h2>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-text-secondary">Nick</dt>
        <dd>{account.nick ?? <span className="text-text-secondary">Sin nick</span>}</dd>
        <dt className="text-text-secondary">Rol</dt>
        <dd>{globalRoleLabel(account.roleGlobal)}</dd>
        <dt className="text-text-secondary">Estado</dt>
        <dd>{account.blockedAt ? `Bloqueada desde el ${formatDate(account.blockedAt)}` : "Activa"}</dd>
        <dt className="text-text-secondary">Alta</dt>
        <dd>{formatDate(account.createdAt)}</dd>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 id="account-clubs" className="font-medium">
          Clubes
        </h3>
        {account.clubs.length === 0 ? (
          <p className="text-sm text-text-secondary">No es miembro de ningún club.</p>
        ) : (
          <ul aria-labelledby="account-clubs" className="flex flex-col gap-1 text-sm">
            {account.clubs.map((club) => (
              <li key={club.id}>
                {club.name} <span className="text-text-secondary">· {clubRoleLabel(club.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
