"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { deleteAccountAction } from "@/lib/admin/actions";
import type { AccountActionResult } from "@/lib/admin/accounts";
import { resultMessage } from "./result-message";

// Delete an account from the Admin panel (#104). It asks first: the deletion cannot
// be undone. When it goes through, the action goes back to the list, which says so
export function AccountDeleteForm({ accountId }: { accountId: string }) {
  const [state, deleteAction, deleting] = useActionState<AccountActionResult | null, FormData>(deleteAccountAction, null);
  const [confirming, setConfirming] = useState(false);
  // Only refusals arrive here: a deletion that goes through leaves the page
  const message = !deleting && resultMessage("delete", state);

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert variant={message.variant}>{message.text}</Alert>}

      <Button variant="destructive" disabled={deleting} onClick={() => setConfirming(true)}>
        {deleting ? "Borrando..." : "Borrar cuenta"}
      </Button>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="¿Borrar esta cuenta?">
        <form action={deleteAction} onSubmit={() => setConfirming(false)} className="flex flex-col gap-4">
          <p className="text-text-secondary">
            Se borran la cuenta y todos sus datos, igual que si la persona borrara su propia cuenta. No se puede
            deshacer.
          </p>
          <input type="hidden" name="accountId" value={accountId} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive">
              Borrar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
