import { notFound } from "next/navigation";
import { AccountBlockForm } from "@/components/admin/AccountBlockForm";
import { AccountDeleteForm } from "@/components/admin/AccountDeleteForm";
import { AccountNickForm } from "@/components/admin/AccountNickForm";
import { AccountProfile } from "@/components/admin/AccountProfile";
import { AccountRoleForm } from "@/components/admin/AccountRoleForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getAccountForAdmin } from "@/lib/admin/queries";

// Admin panel (#102): one account. getAccountForAdmin checks the Admin first (404 for
// anyone else, #199) and gives null for an unknown or malformed id, also a 404
export default async function AdminAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccountForAdmin(id);
  if (!account) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-semibold">Cuenta</h1>
        <Button variant="ghost" href="/admin/accounts">
          Volver a cuentas
        </Button>
      </div>

      <AccountProfile account={account} />

      <Card as="section" aria-labelledby="account-actions" className="flex flex-col gap-6">
        <h2 id="account-actions" className="font-heading text-xl font-semibold">
          Acciones del administrador
        </h2>
        <AccountNickForm accountId={account.id} nick={account.nick} />
        {account.isSelf ? (
          // Removing your own Admin role or blocking yourself would lock you out of the panel;
          // your own account is deleted with the email code (#34), never from here
          <p className="text-sm text-text-secondary">
            Es tu cuenta: no puedes quitarte el rol de administrador, bloquearla ni borrarla desde aquí.
          </p>
        ) : (
          <>
            <AccountRoleForm accountId={account.id} roleGlobal={account.roleGlobal} />
            <AccountBlockForm accountId={account.id} blockedAt={account.blockedAt} />
            <AccountDeleteForm accountId={account.id} />
          </>
        )}
      </Card>
    </div>
  );
}
