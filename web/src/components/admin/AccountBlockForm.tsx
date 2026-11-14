"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { blockAccountAction, unblockAccountAction } from "@/lib/admin/actions";
import type { AccountActionResult } from "@/lib/admin/accounts";
import { resultMessage } from "./result-message";

// Block or unblock an account from the Admin panel (#102). Blocking asks first:
// the person is out on their next request
export function AccountBlockForm({ accountId, blocked }: { accountId: string; blocked: boolean }) {
  const [blockState, blockAction, blocking] = useActionState<AccountActionResult | null, FormData>(
    blockAccountAction,
    null,
  );
  const [unblockState, unblockAction, unblocking] = useActionState<AccountActionResult | null, FormData>(
    unblockAccountAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  // Both results stay in memory: the message is about the last button pressed
  const [lastPressed, setLastPressed] = useState<"block" | "unblock" | null>(null);

  const message = lastPressed && resultMessage(lastPressed, lastPressed === "block" ? blockState : unblockState);

  return (
    <div className="flex flex-col gap-4">
      {message && <Alert variant={message.variant}>{message.text}</Alert>}

      {blocked ? (
        <form action={unblockAction} onSubmit={() => setLastPressed("unblock")}>
          <input type="hidden" name="accountId" value={accountId} />
          <Button type="submit" variant="ghost" disabled={unblocking}>
            {unblocking ? "Desbloqueando..." : "Desbloquear cuenta"}
          </Button>
        </form>
      ) : (
        <Button variant="destructive" disabled={blocking} onClick={() => setConfirming(true)}>
          {blocking ? "Bloqueando..." : "Bloquear cuenta"}
        </Button>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title="¿Bloquear esta cuenta?">
        <form
          action={blockAction}
          onSubmit={() => {
            setLastPressed("block");
            setConfirming(false);
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-text-secondary">
            No podrá entrar en la app desde su siguiente petición, hasta que la desbloquees.
          </p>
          <input type="hidden" name="accountId" value={accountId} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive">
              Bloquear
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
